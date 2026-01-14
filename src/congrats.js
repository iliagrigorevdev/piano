import * as THREE from "three";

const PARTICLE_COUNT = 500;
const DURATION = 3000; // ms
const GRAVITY = -0.01;

export function showCongratsEffect(scene) {
  return new Promise((resolve) => {
    const particlesGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const velocities = [];
    const colors = [];
    const lifetimes = [];

    const sprite = new THREE.TextureLoader().load("icons/particle.svg");
    const colorPalette = [
      new THREE.Color(0xff0000),
      new THREE.Color(0x00ff00),
      new THREE.Color(0x0000ff),
      new THREE.Color(0xffff00),
      new THREE.Color(0x00ffff),
      new THREE.Color(0xff00ff),
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      vertices.push(0, 5, 0); // Start at the center

      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const speed = Math.random() * 0.2 + 0.1;

      const x = Math.sin(theta) * Math.cos(phi) * speed;
      const y = Math.sin(theta) * Math.sin(phi) * speed;
      const z = Math.cos(theta) * speed;
      velocities.push(x, y + 0.2, z);

      const color =
        colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors.push(color.r, color.g, color.b);

      lifetimes.push(Math.random() * DURATION);
    }

    particlesGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    particlesGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.5,
      map: sprite,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
      vertexColors: true,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const startTime = Date.now();

    function animate() {
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime > DURATION) {
        scene.remove(particles);
        particlesGeometry.dispose();
        particlesMaterial.dispose();
        resolve();
        return;
      }

      const positions = particlesGeometry.getAttribute("position").array;
      const opacity = Math.max(0, 1 - elapsedTime / DURATION);
      particlesMaterial.opacity = opacity;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        velocities[i3 + 1] += GRAVITY; // Apply gravity

        positions[i3] += velocities[i3];
        positions[i3 + 1] += velocities[i3 + 1];
        positions[i3 + 2] += velocities[i3 + 2];
      }

      particlesGeometry.getAttribute("position").needsUpdate = true;

      requestAnimationFrame(animate);
    }

    animate();
  });
}
