'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
// import GUI from 'lil-gui';


const phonemeExpressions = {
  'AA': { 24: 0.6, 37: 0.16, 38: 0.16 },
  'AE': { 24: 0.4, 25: 0.4, 37: 0.33, 38: 0.33 },
  'IY': { 24: 0.3, 30: 0.16, 31: 0.16, 37: 0.51, 38: 0.51 },
  'UW': { 19: 0.31, 24: 0.55, 28: 0.4 },
  'B': { 19: 0.21, 32: 0.3, 33: 0.3 },
  'F': { 33: 0, 34: 1, 35: 0 },
  'L': { 20: 0.5, 21: 0.5, 24: 0.35, 37: 0.46, 38: 0.46 },
  'M': { 32: 0.66 },
  'S': { 24: 0.3, 37: 0.31, 38: 0.31 },
  'T': { 15: 0.21, 16: 0.21, 19: 0.26, 24: 0.41, 30: 0.33, 31: 0.33 },
  'AY': { 24: 0.4, 24: 0.2, 24: 0.4, 37: 0.3, 38: 0.3 },
  'OW': { 24: 0.5, 17: 0.5, 18: 0.5, 28: 0.5, 24: 0.13, 17: 0, 18: 0, 28:0.07 },
};

const visemeToPhoneme = {
  'p': 'B', 't': 'T', 'S': 'S', 'T': 'T', 'f': 'F',
  'k': 'T', 'i': 'IY', 'r': 'L', 's': 'S', 'u': 'UW',
  '@': 'AE', 'a': 'AA', 'e': 'IY', 'E': 'AE', 'o': 'OW',
  'O': 'AA'
  // Add more mappings as needed
};

function ParticleModel({ url, scale, particleSize, text, animationSpeed = 1, resetFaceRef }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldResetFace, setShouldResetFace] = useState(false);
  const currentExpressionRef = useRef({});
  const targetExpressionRef = useRef({});
  const particlesRef = useRef();
  const influencesRef = useRef([]);
  const [boundingBox, setBoundingBox] = useState(new THREE.Box3());
  const guiRef = useRef(null);

  const { gl, scene } = useThree();

  // Initialize KTX2Loader
  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader().setTranscoderPath('/basis/');
    loader.detectSupport(gl);
    return loader;
  }, [gl]);

  // Load GLTF model
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.setKTX2Loader(ktx2Loader);
    loader.setMeshoptDecoder(MeshoptDecoder);
  });

  // Extract positions from the GLTF model
  const positions = useMemo(() => {
    let positions = [];
    const tempBox = new THREE.Box3();

    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        const positionAttribute = geometry.attributes.position;
        const matrix = child.matrixWorld;

        for (let i = 0; i < positionAttribute.count; i++) {
          const vertex = new THREE.Vector3();
          vertex.fromBufferAttribute(positionAttribute, i);
          vertex.applyMatrix4(matrix);
          positions.push(vertex.x, vertex.y, vertex.z);
          tempBox.expandByPoint(vertex);
        }
      }
    });

    setBoundingBox(tempBox);

    return new Float32Array(positions);
  }, [gltf]);

  // Calculate center of the model
  const center = useMemo(() => {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    return center;
  }, [boundingBox]);

  // Calculate maximum dimension of the model
  const maxDimension = useMemo(() => {
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    return Math.max(size.x, size.y, size.z);
  }, [boundingBox]);

  // Update morphTarget influences
  const updateInfluences = useCallback((newExpression) => {
    if (influencesRef.current) {
      Object.entries(newExpression).forEach(([index, value]) => {
        if (index >= 0 && index < influencesRef.current.length) {
          influencesRef.current[index] = value;
        }
      });
    }
  }, []);

  // Interpolate between expressions
  const interpolateExpressions = useCallback((current, target, t) => {
    const result = {};
    Object.keys(target).forEach(key => {
      const start = current[key] || 0;
      const end = target[key];
      result[key] = start + (end - start) * t;
    });
    return result;
  }, []);

  // Animate expression based on phonemes
  const animateExpression = useCallback(async (phonemes) => {
    setIsAnimating(true);
    for (let i = 0; i < phonemes.length; i++) {
      const phoneme = phonemes[i];
      const expression = phonemeExpressions[phoneme] || {};
      targetExpressionRef.current = expression;

      const startTime = Date.now();
      const duration = 130 / animationSpeed;

      while (Date.now() - startTime < duration) {
        const t = Math.min((Date.now() - startTime) / duration, 1);
        const interpolatedExpression = interpolateExpressions(currentExpressionRef.current, targetExpressionRef.current, t);
        updateInfluences(interpolatedExpression);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      currentExpressionRef.current = {...targetExpressionRef.current};
    }
    setIsAnimating(false);
  }, [animationSpeed, interpolateExpressions, updateInfluences]);

  // Reset face to neutral expression
  const resetFace = useCallback(() => {
    setShouldResetFace(true);
  }, []);

  // Set up resetFaceRef
  useEffect(() => {
    if (resetFaceRef) {
      resetFaceRef.current = resetFace;
    }
  }, [resetFace, resetFaceRef]);

  // Trigger animation when text changes
  useEffect(() => {
    if (text && !isAnimating) {
      const phoneme = visemeToPhoneme[text] || 'AA';
      animateExpression([phoneme]);
    }
  }, [text, isAnimating, animateExpression]);

  // Set up GUI for morphTarget control
  useEffect(() => {
    // const gui = new GUI();
    // guiRef.current = gui;
    // gui.close();
  
    gltf.scene.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences) {
        influencesRef.current = child.morphTargetInfluences;
        // Object.entries(child.morphTargetDictionary).forEach(([key, index]) => {
        //   // const name = key.replace('blendShape1.', '');
        //   // gui.add(influencesRef.current, index, 0, 1, 0.01).name(name);
        // });
      }
    });
  
    // return () => {
    //   gui.destroy();
    // };
  }, [gltf]);

  useEffect(() => {
    function handleContextLost(event) {
      event.preventDefault();
      console.log('WebGL context lost');
      // Stop your render loop here if needed
    }

    // Handle WebGL context loss and restoration
    function handleContextRestored() {
      console.log('WebGL context restored');
      // Reinitialize your scene and restart your render loop here if needed
    }

    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl]);

  // Update particle positions and apply morphTarget influence
  useFrame(() => {
    if (particlesRef.current) {
      if (shouldResetFace) {
        // Reset all influences to 0
        for (let i = 0; i < influencesRef.current.length; i++) {
          influencesRef.current[i] = 0;
        }
        currentExpressionRef.current = {};
        targetExpressionRef.current = {};
        setShouldResetFace(false);
      }

      gltf.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences) {
          for (let i = 0; i < child.morphTargetInfluences.length; i++) {
            child.morphTargetInfluences[i] = influencesRef.current[i];
          }
        }
      });
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences) {
          for (let i = 0; i < child.morphTargetInfluences.length; i++) {
            child.morphTargetInfluences[i] = influencesRef.current[i];
          }
        }
      });

      const positions = particlesRef.current.geometry.attributes.position.array;
      let index = 0;
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          const geometry = child.geometry;
          const positionAttribute = geometry.attributes.position;
          const matrix = child.matrixWorld;

          for (let i = 0; i < positionAttribute.count; i++) {
            const vertex = new THREE.Vector3();
            vertex.fromBufferAttribute(positionAttribute, i);
            if (child.morphTargetInfluences) {
              for (let j = 0; j < child.morphTargetInfluences.length; j++) {
                const influence = child.morphTargetInfluences[j];
                const morphAttribute = geometry.morphAttributes.position[j];
                const morphVertex = new THREE.Vector3();
                morphVertex.fromBufferAttribute(morphAttribute, i);
                vertex.addScaledVector(morphVertex, influence);
              }
            }
            vertex.applyMatrix4(matrix);
            positions[index++] = vertex.x;
            positions[index++] = vertex.y;
            positions[index++] = vertex.z;
          }
        }
      });
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  // Cleanup function
  useEffect(() => {
    return () => {
      // Dispose of geometries and materials
      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });

      // Dispose of the GUI if it exists
      if (guiRef.current) {
        guiRef.current.destroy();
      }

      // Dispose of the GLTFLoader and KTX2Loader
      if (gltf) {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
      }
      ktx2Loader.dispose();
    };
  }, [scene, gltf, ktx2Loader]);

  return (
    <>
      <PerspectiveCamera makeDefault fov={35} aspect={window.innerWidth / window.innerHeight} near={1} far={20} position={[0, 0.8, 3]} />
      <OrbitControls 
        enableDamping 
        dampingFactor={0.25} 
        rotateSpeed={0.5}
        minDistance={maxDimension * 6}
        maxDistance={maxDimension * 8}
        target={center}
      />
      <points ref={particlesRef} scale={[scale, scale, scale]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial attach="material" color="#a0adad" size={particleSize} sizeAttenuation={true} />
      </points>
    </>
  );
}

export default ParticleModel;