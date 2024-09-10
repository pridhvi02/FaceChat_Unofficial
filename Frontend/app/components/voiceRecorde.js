
export default class VoiceRecorder {
  constructor() {
      this.mediaRecorder = null;
      this.audioContext = null;
      this.analyser = null;
      this.silenceDetectionInterval = null;
      this.lastAudioDetectedTime = 0;
      this.silenceThreshold = 0.12;
      this.silenceDuration = 2000; // 2 seconds
      this.audioChunks = [];
      this.onRecordingComplete = null;
  }

  //method to start audio recording
  startRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
          console.log("Already recording.");
          return;
      }
      // Get access to the microphone
      navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Create an AudioContext for audio processing
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          source.connect(this.analyser);
          // Create a MediaRecorder to record the audio stream
          this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          this.audioChunks = [];
          // Event listener for when audio data is available
          this.mediaRecorder.addEventListener("dataavailable", event => {
              this.audioChunks.push(event.data);
          });
          // Event listener for when recording is stopped
          this.mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            console.log("WebM audio blob created, size:", audioBlob.size);
            // this.saveAudio(audioBlob)
              if (this.onRecordingComplete) {
                console.log("Calling onRecordingComplete with webM blob");
                this.onRecordingComplete(audioBlob);
              }
          });
  
          // Start recording
          this.mediaRecorder.start();
          console.log("Recording started.");
          this.lastAudioDetectedTime = Date.now();
          this.startSilenceDetection();
        })
        .catch(error => {
          console.error("Error accessing the microphone:", error);
        });
}

  // Method to stop audio recording
  stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
          this.mediaRecorder.stop();
          this.stopSilenceDetection();
          console.log("Recording stopped.");
      } else {
          console.log("No active recording to stop.");
      }
  }

  // Method to start silence detection
  startSilenceDetection() {
      this.silenceDetectionInterval = setInterval(() => {
          const audioLevel = this.getAudioLevel();
          if (audioLevel > this.silenceThreshold) {
              this.lastAudioDetectedTime = Date.now();
          } else if (Date.now() - this.lastAudioDetectedTime > this.silenceDuration) {
              this.stopRecording();
          }
      }, 100); // Check every 100ms
  }

  // Method to stop silence detection
  stopSilenceDetection() {
      if (this.silenceDetectionInterval) {
          clearInterval(this.silenceDetectionInterval);
          this.silenceDetectionInterval = null;
      }
  }

  // Method to get the current audio level
  getAudioLevel() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedLevel = average / 255;
    console.log("Current audio level:", normalizedLevel);
    return normalizedLevel;
}

  // Method to save the audio file
  // saveAudio(blob) {
  //   const url = URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.href = url;
  //   a.download = 'recorded_audio.mp3';
  //   document.body.appendChild(a);
  //   a.click();
  //   document.body.removeChild(a);
  //   URL.revokeObjectURL(url);
  //   console.log("Audio file saved");
  // }
}