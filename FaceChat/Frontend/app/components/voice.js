'use client';
import { useRef, useState, useEffect } from 'react';
import VoiceRecorder from './voiceRecorde';
import { startImageCapture, stopImageCapture } from './imageCapture';

const Speak = ({ setText, resetFace }) => {
  // const textAreaRef = useRef(null);
  const audioRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [introPlayed, setIntroPlayed] = useState(false);
  const [appStarted, setAppStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeak, setIsSpeak] =useState(false)
  const recorderRef = useRef(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);

  const introText = "Welcome to project X. I'm your virtual assistant. How can I help you today?";

  // Initialize audio and recorder when the component mounts
  useEffect(() => {
    if (typeof Audio !== 'undefined') {
      audioRef.current = new Audio();
    }
    recorderRef.current = new VoiceRecorder();
  }, []);

  // Play intro when the app starts and intro hasn't been played yet
  useEffect(() => {
    if (appStarted && !introPlayed) {
      playIntro();
    }
  }, [appStarted, introPlayed]);

  // Start recording after the intro has been played
  useEffect(() => {
    if (introPlayed  && !isRecording) {
      captureImageAndStartRecording();
      setIsSpeak(false);
    }
  }, [introPlayed, isRecording]);

  useEffect(() => {
    if (isSpeak) {
      startRecording();
      setIsSpeak(false); // Reset isSpeak after starting recording
    }
  }, [isSpeak]);

  // const playTestAudio = () => {
  //   const audio = new Audio('/sample.mp3');
  //   audio.play().catch(e => console.error('Error playing test audio:', e));
  // };

  // const playAudio = (blob) => {
  //   try {
  //     if (blob) {
  //       const audio = new Audio();
  //       audio.src = URL.createObjectURL(blob);
  //       audio.play().catch(e => console.error('Error playing audio:', e));
  //     } else {
  //       console.error('No audio blob provided');
  //     }
  //   } catch (error) {
  //     console.error('Error in playAudio function:', error);
  //   }
  // };

  //Start image capture and audio recording
  const captureImageAndStartRecording = async () => {
    try {
      const imageBlob = await captureImage();
      setCapturedImage(imageBlob);
      startRecording();
    } catch (error) {
      console.error('Error capturing image:', error);
      startRecording(); // Start recording even if image capture fails
    }
  };

  // Start image capture
  const captureImage = () => {
    return new Promise((resolve, reject) => {
      startImageCapture(0, (blob) => {
        stopImageCapture();
        resolve(blob);
      }).catch(reject);
    });
  };

  // Start audio recording
  const startRecording = () => {
    setIsRecording(true);
    recorderRef.current.startRecording();
    recorderRef.current.onRecordingComplete = async (audioBlob) => {
      console.log('Recording complete, audio blob:', audioBlob);
      setRecordedAudioBlob(audioBlob);
      await handleVerification(audioBlob, capturedImage);
    };
  };

  // Stop audio recording
  const stopRecording = () => {
    setIsRecording(false);
    recorderRef.current.stopRecording();
  };

  // Start the application
  const startApp = () => {
    setAppStarted(true);
  };

  const handleVerification = async (audioBlob, capturedImage) => {
    const formData = new FormData();
    // Append the image and audio blob to the FormData object
    formData.append('image', capturedImage);
    formData.append('audio', audioBlob);
    try {
      // Send the recorded audio and image to the verification endpoint
      const response = await fetch('http://localhost:80/auth/api/verify', {
        method: 'POST',
        body: formData
      });
  
      if (!response.ok) {
        throw new Error('Verification failed');
      }
  
      const { status, responseText } = await response.json();
  
      // If the user is verified, proceed to the conversation endpoint
      if (status === 'verified') {
        setIsVerified(true);
        await sendToConversationEndpoint(responseText);
      } else {
        // If the user is not verified, proceed to the registration endpoint
        await handleRegistration(responseText);
      }
    } catch (error) {
      console.error('Error during verification:', error);
    }
  };
  
  const sendToConversationEndpoint = async (audioBlob, responseText) => {
    try {
      const response = await fetch('http://localhost:80/conversation/api/conversation', {
        method: 'POST',
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error('Failed to send to conversation endpoint');
      }

      await speakText(responseText);
      setIsSpeak(true);  // Continue recording for further conversation
    } catch (error) {
      console.error('Error sending to conversation endpoint:', error);
    }
  };
  
  const handleRegistration = async (audioBlob, responseText) => {
    try {
      const response = await fetch('http://localhost:80/auth/api/register', {
        method: 'POST',
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const { status, responseText } = await response.json();

      // Convert the response text to speech and play it
      await speakText(responseText);

      if (status === 'registered') {
        // If registration is successful and the user is now verified, switch to the conversation endpoint
        setIsVerified(true);
        setIsSpeak(true);
      } else {
        // Handle cases where the user still isn't verified
        setIsSpeak(true);
      }
    } catch (error) {
      console.error('Error during registration:', error);
    }
  };

  // Play the introductory audio
  const playIntro = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/syn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: introText })
      });
      if (!response.ok) {
        throw new Error('Failed to synthesize intro speech');
      }
      const { speechMarks, audioContent } = await response.json();
      const audioBlob = new Blob([Buffer.from(audioContent, 'base64')], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      let currentMark = 0;
      audioRef.current.ontimeupdate = () => {
        while (currentMark < speechMarks.length &&
               audioRef.current.currentTime * 1000 >= speechMarks[currentMark].time) {
          const mark = speechMarks[currentMark];
          if (mark.type === 'viseme') {
            setText(mark.value); // Update text with viseme value
          } else if (mark.type === 'word') {
            console.log('Word:', mark.value);
          }
          currentMark++;
        }
      };
      audioRef.current.onended = () => {
        setIsLoading(false);
        setText('');
        setIntroPlayed(true);
        setTimeout(() => {
          resetFace();
        }, 300);
      };
    } catch (error) {
      console.error('Error playing intro:', error);
      setIsLoading(false);
      setIntroPlayed(false);
      resetFace();
    }
  };

  // Synthesize and play speech
  const speakText = async (text) => {
    // const text = textAreaRef.current.value;
    if (text) {
      setIsLoading(true);
      try {
        const response = await fetch('/api/syn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!response.ok) {
          throw new Error('Failed to synthesize speech');
        }
        const { speechMarks, audioContent } = await response.json();
        const audioBlob = new Blob([Buffer.from(audioContent, 'base64')], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        let currentMark = 0;
        audioRef.current.ontimeupdate = () => {
          while (currentMark < speechMarks.length &&
                 audioRef.current.currentTime * 1000 >= speechMarks[currentMark].time) {
            const mark = speechMarks[currentMark];
            if (mark.type === 'viseme') {
              setText(mark.value); // Update text with viseme value
            } else if (mark.type === 'word') {
              console.log('Word:', mark.value);
            }
            currentMark++;
          }
        };
        audioRef.current.onended = () => {
          setIsLoading(false);
          setText('');
          setIsSpeak(true);
          setTimeout(() => {
            resetFace();
          }, 300);
        };
      } catch (error) {
        console.error('Error:', error);
        setIsLoading(false);
        setIsSpeak(false);
        resetFace();
      }
    }
  };

  if (!appStarted) {
    return (
      <div>
        <button className='text-white' onClick={startApp}>
          Start Application
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* <textarea className='mt-2' ref={textAreaRef}></textarea> */}
      {/* <button className='text-white' onClick={speak} disabled={isLoading}>
        {isLoading ? 'Speaking...' : 'Speak'}
      </button> */}
      {/* {isRecording ? (
        <button className='text-white' onClick={stopRecording}>
          Stop Recording
        </button>
      ) : (
        <button className='text-white' onClick={startRecording} disabled={isLoading}>
          Start Recording
        </button>
      )} */}
      {/* <button onClick={() => playAudio(recordedAudioBlob)}>play the music</button>
      <button onClick={playTestAudio}>Play Test Audio</button> */}
    </div>
  );
};

export default Speak;