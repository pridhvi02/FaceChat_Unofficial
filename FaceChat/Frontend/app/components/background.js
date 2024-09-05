'use client'

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const WaveBackground = ({ color = '#939393' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    let SEPARATION = 40, AMOUNTX = 130, AMOUNTY = 35;
    let camera, scene, renderer;
    let particles, count = 0;

    function init() {
      camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 1, 10000);
      camera.position.y = 150;
      camera.position.z = 300;
      camera.rotation.x = 0.35;

      scene = new THREE.Scene();

      let numParticles = AMOUNTX * AMOUNTY;
      let positions = new Float32Array(numParticles * 3);
      let scales = new Float32Array(numParticles);

      let i = 0, j = 0;

      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2); // x
          positions[i + 1] = 0; // y
          positions[i + 2] = iy * SEPARATION - ((AMOUNTY * SEPARATION) - 10); // z
          scales[j] = 1;
          i += 3;
          j++;
        }
      }

      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

      let material = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(color) },
        },
        vertexShader: `
          attribute float scale;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = scale * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          void main() {
            if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) discard;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });

      particles = new THREE.Points(geometry, material);
      scene.add(particles);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0xffffff, 0);
      containerRef.current.appendChild(renderer.domElement);
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
      requestAnimationFrame(animate);
      render();
    }

    function render() {
      let positions = particles.geometry.attributes.position.array;
      let scales = particles.geometry.attributes.scale.array;

      let i = 0, j = 0;

      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positions[i + 1] = (Math.sin((ix + count) * 0.5) * 20) + (Math.sin((iy + count) * 0.5) * 20);
          scales[j] = (Math.sin((ix + count) * 0.3) + 2) * 4 + (Math.sin((iy + count) * 0.5) + 1) * 4;
          i += 3;
          j++;
        }
      }

      particles.geometry.attributes.position.needsUpdate = true;
      particles.geometry.attributes.scale.needsUpdate = true;

      renderer.render(scene, camera);

      count += 0.2;
    }

    init();
    animate();

    window.addEventListener('resize', onWindowResize, false);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      if (renderer) {
        renderer.dispose();
      }
      if (particles) {
        particles.geometry.dispose();
        particles.material.dispose();
      }
    };
  }, [color]);

  return <div ref={containerRef} className="fixed top-0 left-0 w-full h-full z-10 mt-32"></div>;
};

export default WaveBackground;