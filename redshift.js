(function () {
  "use strict";

  const canvas = document.getElementById("fluid-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  // Keep a still background when the visitor requests reduced motion.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("no-webgl");
    return;
  }

  const gl =
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
    }) || canvas.getContext("experimental-webgl");

  if (!gl) {
    document.body.classList.add("no-webgl");
    return;
  }

  const VERTEX_SOURCE = `
    attribute vec2 a_position;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SOURCE = `
    precision highp float;

    #define TRAIL_COUNT 24

    uniform vec2 u_resolution;
    uniform vec2 u_pointer;
    uniform float u_time;
    uniform float u_intensity;
    uniform float u_pulse;
    uniform vec4 u_trail[TRAIL_COUNT];

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
        f.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
        value += noise(p) * amplitude;
        p = p * 2.03 + vec2(13.1, 7.7);
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 aspectScale = vec2(aspect, 1.0);

      vec2 flow = vec2(0.0);
      float redWake = 0.0;
      float hotWake = 0.0;
      float blueFringe = 0.0;

      for (int i = 0; i < TRAIL_COUNT; i++) {
        vec4 point = u_trail[i];
        vec2 delta = (uv - point.xy) * aspectScale;
        float distanceToPoint = length(delta);
        float radius = mix(0.025, 0.13, point.z);
        float glow = exp(-(distanceToPoint * distanceToPoint) / (radius * radius));
        float life = point.z * point.z;

        vec2 tangent = vec2(-delta.y, delta.x);
        flow += tangent * glow * life * (0.006 + point.w * 0.012);
        redWake += glow * life * (0.18 + point.w * 0.3);

        float core = exp(
          -(distanceToPoint * distanceToPoint) /
          max(0.00028, radius * radius * 0.08)
        );
        hotWake += core * life * (0.12 + point.w * 0.42);

        vec2 fringeDelta = (uv - point.xy + vec2(0.008, 0.0)) * aspectScale;
        float fringeDistance = length(fringeDelta);
        blueFringe += exp(
          -(fringeDistance * fringeDistance) /
          max(0.0007, radius * radius * 0.18)
        ) * life * point.w;
      }

      vec2 warpedUv = uv + flow * u_intensity;
      float slowTime = u_time * 0.19;

      float broadNoise = fbm(
        vec2(warpedUv.x * 2.4 + slowTime, warpedUv.y * 2.0 - slowTime * 0.55)
      );
      float fineNoise = fbm(
        vec2(warpedUv.x * 7.0 - slowTime * 1.4, warpedUv.y * 3.1)
      );

      float waveA =
        sin(warpedUv.x * 8.2 + slowTime * 4.0 + broadNoise * 4.5) * 0.5 + 0.5;
      float waveB =
        sin(warpedUv.x * 13.0 - slowTime * 2.8 + fineNoise * 3.2) * 0.5 + 0.5;
      float rays = pow(mix(waveA, waveB, 0.4), 4.2);
      float curtain = smoothstep(0.04, 0.92, warpedUv.y) * (0.38 + broadNoise * 0.62);
      float horizon = exp(-pow((warpedUv.y - 0.54 - broadNoise * 0.08) * 3.1, 2.0));

      vec3 colour = mix(
        vec3(0.008, 0.003, 0.006),
        vec3(0.075, 0.002, 0.012),
        warpedUv.x * 0.55 + broadNoise * 0.22
      );

      colour += vec3(0.34, 0.003, 0.018) * curtain * rays * 0.72;
      colour += vec3(0.2, 0.006, 0.012) * horizon * (0.2 + fineNoise * 0.24);

      float pointerDistance = length((uv - u_pointer) * aspectScale);
      float pointerField = exp(-pointerDistance * pointerDistance / 0.032);
      colour += vec3(0.2, 0.004, 0.01) * pointerField * 0.46;

      colour += vec3(1.05, 0.006, 0.025) * redWake * u_intensity;
      colour += vec3(1.0, 0.11, 0.025) * hotWake * u_intensity;
      colour += vec3(0.02, 0.016, 0.16) * blueFringe * 0.26 * u_intensity;

      float pulseRadius = 0.025 + u_pulse * 0.38;
      float pulseRing = exp(
        -abs(pointerDistance - pulseRadius) * mix(150.0, 45.0, u_pulse)
      ) * (1.0 - clamp(u_pulse, 0.0, 1.0));
      colour += vec3(1.2, 0.025, 0.014) * pulseRing * 1.6;

      float scanline = 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159265);
      float verticalMask = 0.975 + 0.025 * sin(gl_FragCoord.x * 1.55);
      colour *= scanline * verticalMask;

      vec2 centred = uv - 0.5;
      centred.x *= aspect;
      float vignette = smoothstep(0.92, 0.22, length(centred));
      colour *= mix(0.18, 1.0, vignette);

      float grain = hash(gl_FragCoord.xy + fract(u_time) * 731.7) - 0.5;
      colour += grain * 0.022;

      colour = pow(max(colour, 0.0), vec3(0.86));
      gl_FragColor = vec4(colour, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);

  if (!vertexShader || !fragmentShader) {
    document.body.classList.add("no-webgl");
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    document.body.classList.add("no-webgl");
    return;
  }

  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    pointer: gl.getUniformLocation(program, "u_pointer"),
    time: gl.getUniformLocation(program, "u_time"),
    intensity: gl.getUniformLocation(program, "u_intensity"),
    pulse: gl.getUniformLocation(program, "u_pulse"),
    trail: gl.getUniformLocation(program, "u_trail[0]"),
  };

  const TRAIL_COUNT = 24;
  const trail = Array.from({ length: TRAIL_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    life: 0,
    speed: 0,
  }));
  const trailData = new Float32Array(TRAIL_COUNT * 4);

  const pointer = {
    targetX: 0.5,
    targetY: 0.5,
    x: 0.5,
    y: 0.5,
    previousX: 0.5,
    previousY: 0.5,
    speed: 0,
    lastInput: performance.now(),
    lastEmission: 0,
    active: false,
  };

  const cursorAura = document.querySelector(".cursor-aura");
  const cursorCore = document.querySelector(".cursor-core");
  const coordinateX = document.querySelector("[data-coordinate-x]");
  const coordinateY = document.querySelector("[data-coordinate-y]");
  const pulseButton = document.querySelector("[data-pulse]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frameId = 0;
  let startTime = performance.now();
  let previousFrame = startTime;
  let pulseAge = 2;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.round(bounds.width * pixelRatio));
    height = Math.max(1, Math.round(bounds.height * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function updatePointer(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    pointer.targetX = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    pointer.targetY = Math.min(
      1,
      Math.max(0, 1 - (clientY - bounds.top) / bounds.height),
    );
    pointer.lastInput = performance.now();
    pointer.active = true;

    document.body.classList.add("has-pointer");
    cursorCore?.style.setProperty(
      "transform",
      `translate3d(${clientX}px, ${clientY}px, 0)`,
    );
    coordinateX && (coordinateX.textContent = (pointer.targetX * 100).toFixed(1));
    coordinateY && (coordinateY.textContent = ((1 - pointer.targetY) * 100).toFixed(1));
  }

  function emitTrail(force) {
    const now = performance.now();
    const dx = pointer.x - pointer.previousX;
    const dy = pointer.y - pointer.previousY;
    const distance = Math.hypot(dx, dy);

    if (!force && distance < 0.002 && now - pointer.lastEmission < 42) return;

    pointer.speed = Math.min(1, distance * 32);
    trail.pop();
    trail.unshift({
      x: pointer.x,
      y: pointer.y,
      life: 1,
      speed: Math.max(0.16, pointer.speed),
    });

    pointer.previousX = pointer.x;
    pointer.previousY = pointer.y;
    pointer.lastEmission = now;
  }

  function triggerPulse() {
    pulseAge = 0;
    for (let index = 0; index < 7; index += 1) {
      const angle = (Math.PI * 2 * index) / 7;
      const radius = 0.012 + index * 0.002;
      trail.pop();
      trail.unshift({
        x: Math.min(1, Math.max(0, pointer.x + Math.cos(angle) * radius)),
        y: Math.min(1, Math.max(0, pointer.y + Math.sin(angle) * radius)),
        life: 1,
        speed: 1,
      });
    }
  }

  function render(now) {
    resize();

    const delta = Math.min(0.05, Math.max(0.001, (now - previousFrame) / 1000));
    previousFrame = now;

    pointer.x += (pointer.targetX - pointer.x) * Math.min(1, delta * 10.5);
    pointer.y += (pointer.targetY - pointer.y) * Math.min(1, delta * 10.5);

    if (pointer.active || now - pointer.lastInput < 1200) {
      emitTrail(false);
    }

    const decay = Math.pow(0.944, delta * 60);
    trail.forEach((point) => {
      point.life *= decay;
      point.speed *= Math.pow(0.976, delta * 60);
    });

    for (let index = 0; index < TRAIL_COUNT; index += 1) {
      const point = trail[index];
      const offset = index * 4;
      trailData[offset] = point.x;
      trailData[offset + 1] = point.y;
      trailData[offset + 2] = point.life;
      trailData[offset + 3] = point.speed;
    }

    if (pulseAge <= 1.2) pulseAge += delta * 0.78;

    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform1f(
      uniforms.time,
      reducedMotion.matches ? 0 : (now - startTime) / 1000,
    );
    gl.uniform1f(uniforms.intensity, reducedMotion.matches ? 0.58 : 1);
    gl.uniform1f(uniforms.pulse, Math.min(1.2, pulseAge));
    gl.uniform4fv(uniforms.trail, trailData);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (cursorAura instanceof HTMLElement) {
      const screenX = pointer.x * window.innerWidth;
      const screenY = (1 - pointer.y) * window.innerHeight;
      cursorAura.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
    }

    frameId = window.requestAnimationFrame(render);
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      updatePointer(event.clientX, event.clientY);
    },
    { passive: true },
  );

  window.addEventListener(
    "dragover",
    (event) => {
      updatePointer(event.clientX, event.clientY);
    },
    { passive: true },
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      updatePointer(event.clientX, event.clientY);
      triggerPulse();
    },
    { passive: true },
  );

  window.addEventListener("resize", resize, { passive: true });
  pulseButton?.addEventListener("click", triggerPulse);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frameId);
    } else {
      previousFrame = performance.now();
      frameId = window.requestAnimationFrame(render);
    }
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    window.cancelAnimationFrame(frameId);
    canvas.style.visibility = "hidden";
  });

  resize();
  emitTrail(true);
  frameId = window.requestAnimationFrame(render);
})();
