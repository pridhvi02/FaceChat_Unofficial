import React, { useState, useCallback, useEffect } from 'react';

// store ImageCapture instance and the capture interval timer
let imageCapture = null;
let captureInterval = null;

// Function to start image capture at specified intervals
const startImageCapture = (intervalMs, onCapture) => {
  if (captureInterval) {
    console.warn('Image capture is already running');
    return Promise.resolve();
  }

  console.log('Requesting camera permission...');
  // Request access to the user's camera
  return navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      console.log('Camera permission granted');
      // Extract the video track from the stream
      const track = stream.getVideoTracks()[0];
      // Create an ImageCapture instance using the video track
      imageCapture = new ImageCapture(track);

      console.log('Starting capture interval');
      // Set an interval to capture images at the specified interval
      captureInterval = setInterval(() => {
        console.log('Attempting to capture image');
        // Capture an image using the ImageCapture instance
        imageCapture.takePhoto()
          .then(blob => {
            console.log('Image captured successfully');
            const file = new File([blob], 'captured-image.jpg', { type: blob.type });
          // Pass the File object to the onCapture callback
          onCapture(file);
          })
          .catch(error => {
            console.error('Error capturing image:', error);
          });
      }, intervalMs);
    })
    .catch(error => {
      console.error('Error accessing camera:', error);
      throw error;
    });
};

// Function to stop image capture
const stopImageCapture = () => {
  console.log('Stopping image capture');
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  
  if (imageCapture) {
    const track = imageCapture.track;
    track.stop();
    imageCapture = null;
  }
};

// React component to render the capture button and manage state
export function CaptureButton({ captureInterval = 5000 }) {
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleImageCapture = useCallback((file) => {
    const imgUrl = URL.createObjectURL(file);
    console.log('Captured image URL:', imgUrl);
    // Here you can send the file to your backend or process it further
    URL.revokeObjectURL(imgUrl);
  }, []);

  // Toggle function to start or stop image capture
  const toggleImageCapture = useCallback(() => {
    if (isCameraActive) {
      stopImageCapture();
      setIsCameraActive(false);
    } else {
      console.log('Starting image capture');
      startImageCapture(captureInterval, handleImageCapture)
        .then(() => setIsCameraActive(true))
        .catch(() => setIsCameraActive(false));
    }
  }, [isCameraActive, captureInterval, handleImageCapture]);

  // Cleanup effect to stop image capture when the component unmounts
  useEffect(() => {
    return () => {
      if (isCameraActive) {
        stopImageCapture();
      }
    };
  }, [isCameraActive]);

  return (
    <button onClick={toggleImageCapture}>
      {isCameraActive ? 'Stop Capture' : 'Start Capture'}
    </button>
  );
}

export { startImageCapture, stopImageCapture };