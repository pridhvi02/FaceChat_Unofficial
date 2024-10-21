'use client';
import { useRef, useState, useEffect } from 'react';
import VoiceRecorder from './voiceRecorde';
import { startImageCapture, stopImageCapture } from './imageCapture';
import { toast } from '@/hooks/use-toast';

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
  const [isRegistration, setIsRegistration] = useState(false);
  const [isConversation,setIsConversation] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [toastMessage, setToastMessage] = useState(false);

  const showToast = () => {
    toast({
      description: "hello world",
    })
    setToastMessage(true);
  };

  const hideToast = () => {
    setToastMessage(false);
  };

  const introText = "Welcome to project X. I'm your virtual assistant. How can I help you today?";
  const conformationMessage = "say the message shown in the screen to verify your audio!"

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
      // Speak the confirmation message and wait for it to finish before starting recording
      await playVerfy();
      if (imageBlob) {
        startRecording(imageBlob); // Pass imageBlob to startRecording
      } else {
        console.error("Image Blob is missing!");
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      // Start recording even if image capture fails, but wait for speech to finish first
      await playVerfy();
      startRecording();
    }
  };

  // Start image capture
const captureImage = () => {
  return new Promise((resolve, reject) => {
    startImageCapture((blob) => {
      // Resolve with the blob and stop the image capture
      stopImageCapture();
      // console.log(blob, 'image...')
      resolve(blob);
    }).catch((error) => {
      console.error('Error in startImageCapture:', error);
      reject(error);
    });
  });
};

  // Start audio recording
  const startRecording = (imageBlob) => {
    console.log("Image Blob passed to startRecording:", imageBlob);
    setIsRecording(true);
    recorderRef.current.startRecording();
    recorderRef.current.onRecordingComplete = async (audioBlob) => {
      hideToast();
      console.log('Recording complete, audio blob:', audioBlob);
      setRecordedAudioBlob(audioBlob);
      if (isRegistration) {
        await handleRegistration(audioBlob);
      } else if (isConversation){
        await sendToConversationEndpoint(audioBlob);
      }else {
        console.log("Verifying with Audio and Image:", audioBlob, imageBlob)
        await handleVerification(audioBlob, imageBlob);
      }
      // console.log(audioBlob, 'aud...');
      // console.log(imageBlob,'img...')
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

  const handleVerification = async (audioBlob, imageBlob) => {
    // console.log("Captured Image:", imageBlob); 
    // console.log("Audio Blob:", audioBlob);
    if (!audioBlob || !imageBlob) {
        console.error("Missing audio or image for verification");
        return;
    }

    const formData = new FormData();
    // Append the image and audio blob to the FormData object
    formData.append('face_image', imageBlob, 'image.jpg');  // You can specify a file name here
    formData.append('voice_audio', audioBlob, 'audio.wav');  // You can specify a file name here

    try {
      console.log('before endpoint')
      const url = 'http://localhost:8000/auth/api/verify';
      console.log(url,'thisurl.');
        // Send the recorded audio and image to the verification endpoint
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include', 
            body: formData,
            headers: {
                'Accept': 'application/json'  // Ensure correct response content-type
            }
        });

        if (!response.ok) {
            throw new Error('Verification failed');
        }
  
        const result = await response.json();  // Ensure you're reading the response as JSON
        console.log('Verification response:', result);

        if (result.status === 'verified') {
          await speakText(result.responseText);
            setIsVerified(true);
            setIsConversation(true);
            
            await sendToConversationEndpoint(audioBlob);  // You may need to modify this for correct audio data

        } else {
            await speakText(result.responseText);
            setIsRegistration(true); 
            await handleRegistration(audioBlob);
        }
    } catch (error) {
        console.error('Error during verification:', error);
    }
};
  
  const sendToConversationEndpoint = async (audioBlob, responseText) => {
    
    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'audio.wav')
    try {
      const urll = 'http://localhost:8000/conversation/api/conversation';
      const response = await fetch(urll, {
        method: 'POST',
        credentials: 'include', 
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to send to conversation endpoint');
      }

       const { responseText } = await response.json();

      await speakText(responseText);
      // await sendToConversationEndpoint(audioBlob);  
      setIsRegistration(false);
      setIsConversation(true);
      
    } catch (error) {
      console.error('Error sending to conversation endpoint:', error);
    }
  };
  
  const handleRegistration = async (audioBlob, responseText) => {
    
    const formData = new FormData();
    formData.append('voice_file', audioBlob, 'audio.wav')
    console.log('Audio Blob:', audioBlob);
    console.log('FormData entries:', [...formData.entries()]);
    try {
      const response = await fetch('http://localhost:8000/auth/api/register', {
        method: 'POST',
        credentials: 'include', 
        body: formData
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const { status, responseText } = await response.json();

      // Convert the response text to speech and play it
      

      if (status === 'registered') {
        // If registration is successful and the user is now verified, switch to the conversation endpoint
        setIsConversation(true);
        await speakText(responseText);
        await sendToConversationEndpoint(audioBlob);
        
      } else {
        // Handle cases where the user still isn't verified
        await speakText(responseText);
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

    // Play the verification audio
    const playVerfy = async () => {
      if (isVerifying) return; // Prevent multiple triggers

      showToast();
      setIsVerifying(true);
      setIsLoading(true);
      try {
        const response = await fetch('/api/syn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: conformationMessage })
        });
        if (!response.ok) {
          throw new Error('Failed to synthesize intro speech');
        }
        const { speechMarks, audioContent } = await response.json();
        const audioBlob = new Blob([Buffer.from(audioContent, 'base64')], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioRef.current.src = audioUrl;
        return new Promise((resolve, reject) => {
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
          setText('');
          setIsVerifying(false);
          resolve(); 
          setTimeout(() => {
            resetFace();
          }, 300);
        };
        audioRef.current.onerror = (err) => {
          resetFace();
          reject(err);  // Reject the promise if there is an error
        };
      });
      } catch (error) {
        console.error('Error playing intro:', error);
        setIsVerifying(false);
        resetFace();
        reject(err);
      }
    };

  // Synthesize and play speech
  const speakText = async (text) => {
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
  
        // Return a promise that resolves only after the audio has finished playing
        return new Promise((resolve, reject) => {
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
            resolve();
            setTimeout(() => {
              resetFace();
            }, 300); // Resolve the promise when the audio ends
          };
  
          audioRef.current.onerror = (err) => {
            setIsLoading(false);
            setIsSpeak(false);
            resetFace();
            reject(err);  // Reject the promise if there is an error
          };
        });
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
      <div className={`relative w-full flex items-center justify-center top-3`}>
      {!appStarted && (
        <button
          className="text-white border px-4 py-2 rounded-lg z-10 relative"
          onClick={startApp}
        >
          Start Application
        </button>
      )}
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