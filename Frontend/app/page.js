'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import ParticleModel from './components/particle';
import Speak from './components/voice';
import { useState, useRef } from "react";
import Background from './components/background';
// import { CaptureButton } from './components/imageCapture';

const HomePage = () => {
  const [text, setText] = useState('');
  const resetFaceRef = useRef(null);

  return (
    <>
      <div className={`bg-[url('https://img.freepik.com/free-vector/blue-sparkling-shiny-bokeh-background-design_1017-36398.jpg')] bg-cover bg-center`}>
      <Speak setText={setText} resetFace={() => resetFaceRef.current && resetFaceRef.current()}/>
      <Background color="#be22d6"/>
      <Canvas
      gl={{
      powerPreference: "high-performance",
      antialias: true,
      stencil: false,
      depth: false
      }}
      style={{ width: '100vw', height: '100vh', position: 'relative', zIndex:'1000'}}>
        <ambientLight intensity={0.5} />
        <ParticleModel url="/faceman.glb" scale={2} particleSize={0.05} text={text} setText={setText} animationSpeed={1.2} resetFaceRef={resetFaceRef} />
      </Canvas>
      </div>
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000
      }}>
        {/* <CaptureButton captureInterval={5000} /> */}
      </div>
    </>
  );
};

export default HomePage;

