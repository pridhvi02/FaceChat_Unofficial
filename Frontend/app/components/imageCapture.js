import React, { useState, useCallback, useEffect } from 'react';

// Store ImageCapture instance
let imageCapture = null;
let videoStream = null;

// Function to start image capture
// Function to start image capture
const startImageCapture = (onCapture) => {
  if (imageCapture) {
    console.warn('Image capture is already running');
    return Promise.resolve();
  }

  if (typeof onCapture !== 'function') {
    console.error('onCapture is not a function');
    return Promise.reject(new Error('onCapture is not a function'));
  }

  console.log('Requesting camera permission...');
  // Request access to the user's camera
  return navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      console.log('Camera permission granted');
      videoStream = stream;  // Store the stream for later cleanup
      // Extract the video track from the stream
      const track = stream.getVideoTracks()[0];
      // Create an ImageCapture instance using the video track
      imageCapture = new ImageCapture(track);

      console.log('Image capture started');
      // Capture an image
      return imageCapture.takePhoto()
        .then(blob => {
          console.log('Image captured successfully');
          // Pass the Blob object to the onCapture callback
          onCapture(blob);
          // Stop the camera and release resources
          stopImageCapture();
        })
        .catch(error => {
          console.error('Error capturing image:', error);
          stopImageCapture(); // Ensure cleanup on error
          throw error;
        });
    })
    .catch(error => {
      console.error('Error accessing camera:', error);
      throw error;
    });
};


// Function to stop image capture
const stopImageCapture = () => {
  console.log('Stopping image capture');
  if (imageCapture) {
    const track = imageCapture.track;
    track.stop();
    imageCapture = null;
  }
  
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop()); // Stop all tracks in the stream
    videoStream = null;
  }
};

// React component to render the capture button and manage state
export function CaptureButton() {
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleImageCapture = useCallback((blob) => {
    const imgUrl = URL.createObjectURL(blob);
    console.log('Captured image URL:', imgUrl);
    // Here you can send the blob to your backend or process it further
    URL.revokeObjectURL(imgUrl);
  }, []);

  // Function to start or stop image capture
  const captureImage = useCallback(() => {
    if (isCameraActive) {
      // If camera is already active, stop capturing
      stopImageCapture();
      setIsCameraActive(false);
    } else {
      // Otherwise, start image capture
      startImageCapture(handleImageCapture)
        .then(() => setIsCameraActive(true))
        .catch(() => setIsCameraActive(false));
    }
  }, [isCameraActive, handleImageCapture]);

  // Cleanup effect to stop image capture when the component unmounts
  useEffect(() => {
    return () => {
      if (isCameraActive) {
        stopImageCapture();
      }
    };
  }, [isCameraActive]);

  return (
    <button onClick={captureImage}>
      {isCameraActive ? 'Stop Capture' : 'Capture Image'}
    </button>
  );
}

export { startImageCapture, stopImageCapture };
