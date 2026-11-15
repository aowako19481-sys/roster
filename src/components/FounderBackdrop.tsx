"use client";

import { useEffect, useRef } from "react";

const VERTEX = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
// A slow field of folded light in violet and black, with a faint floor grid
// receding into the distance. Drawn on the graphics card; no library.
const FRAGMENT = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;
float h(vec2 p){p+=.4*vec2(sin(p.y*1.3+t*.2),cos(p.x*1.1-t*.16));float a=sin(p.x*1.7+t*.26+sin(p.y*2.1-t*.18)*1.25)*.5;a+=sin(p.y*2.3-t*.22+sin(p.x*1.9+t*.12)*1.4)*.36;return a;}
void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;uv+=(m-.5)*vec2(.12,.08);
  vec2 p=uv*2.4;p=vec2(p.x*.85+p.y*.5,p.y*1.5-p.x*.35);float e=.014;
  vec3 n=normalize(vec3(h(p-vec2(e,0.))-h(p+vec2(e,0.)),h(p-vec2(0.,e))-h(p+vec2(0.,e)),e*4.2));
  vec3 l=normalize(vec3(.3+m.x*.4,.8,.55));float d=max(dot(n,l),0.),s=pow(max(reflect(-l,n).z,0.),30.);
  vec3 c=mix(vec3(.02,.016,.045),vec3(.34,.25,.62),d*d)+s*vec3(.75,.66,1.)*.55;
  c*=.55+.45*h(p);
  // the floor grid, only in the lower part of the screen
  float y=-uv.y-.08;if(y>0.){float z=.42/y;vec2 g=vec2(uv.x*z,z+t*.35);vec2 f=abs(fract(g)-.5);float line=smoothstep(.47,.5,max(f.x,f.y));c+=vec3(.5,.42,.95)*line*.22*smoothstep(0.,.35,y)*exp(-z*.09);}
  c*=mix(.25,1.,smoothstep(1.5,.1,length(uv+vec2(-.3,.05))));gl_FragColor=vec4(c,1.);}`;

/** The founder console's moving backdrop. Decorative: it carries no information. */
export function FounderBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false });
    if (!canvas || !gl) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shader = (type: number, source: string) => {
      const made = gl.createShader(type)!;
      gl.shaderSource(made, source);
      gl.compileShader(made);
      return made;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const size = gl.getUniformLocation(program, "r");
    const time = gl.getUniformLocation(program, "t");
    const mouse = gl.getUniformLocation(program, "m");

    let frame = 0;
    let stopped = false;
    const target = { x: 0.5, y: 0.5 };
    const eased = { x: 0.5, y: 0.5 };
    const resize = () => {
      // Drawn at reduced resolution: it is a soft backdrop, and this keeps it cheap.
      const scale = Math.min(window.devicePixelRatio || 1, 1.25) * 0.7;
      canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (ms: number) => {
      eased.x += (target.x - eased.x) * 0.04;
      eased.y += (target.y - eased.y) * 0.04;
      gl.uniform2f(size, canvas.width, canvas.height);
      gl.uniform1f(time, ms / 1000 + 30);
      gl.uniform2f(mouse, eased.x, 1 - eased.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!stopped && !still && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth;
      target.y = event.clientY / window.innerHeight;
    };
    const wake = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const onResize = () => {
      resize();
      if (still) draw(0);
    };
    resize();
    draw(0);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
}
