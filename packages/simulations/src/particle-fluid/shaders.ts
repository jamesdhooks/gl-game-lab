export const PARTICLE_FLUID_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
uniform sampler2D uPositionState,uVelocityState,uFlowField;
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform float uDt,uParticleDrag;
uniform vec2 uFlowScale;
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy);
  int id=cell.y*uStateSize.x+cell.x;
  vec4 p=texelFetch(uPositionState,cell,0),v=texelFetch(uVelocityState,cell,0);
  if(id>=uCapacity){outPosition=p;outVelocity=v;return;}
  vec2 flow=texture(uFlowField,(p.xy+1.)*.5).xy*uFlowScale;
  v.xy+=(flow-v.xy)*uParticleDrag;
  p.xy+=v.xy*uDt;
  outPosition=p;outVelocity=v;
}`;

export const PARTICLE_FLUID_VERTEX_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPositionState,uVelocityState;
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform float uPointSize,uSpeedColorScale,uBloomStrength,uEnhanced,uAspectRatio,uSimulationScale;
uniform vec3 uSlowColor,uFastColor,uHotColor,uPulseColor;
uniform vec4 uPulseSegment,uPulseParams;
out vec4 vColor;
vec2 distanceToSegment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;float len=length(ab);if(len<=.0001)return vec2(length(p-a),0);float projection=dot(p-a,ab)/len,fraction=projection/len;if(projection<0.)return vec2(length(p-a),fraction);if(projection>len)return vec2(length(p-b),fraction);return vec2(sqrt(max(0.,dot(p-a,p-a)-projection*projection)),fraction);}
void main(){
  int id=gl_VertexID;ivec2 cell=ivec2(id%uStateSize.x,id/uStateSize.x);
  vec4 p=texelFetch(uPositionState,cell,0),v=texelFetch(uVelocityState,cell,0);
  vec2 clip=p.xy;
  float speed=length(v.xy),x=clamp(speed*uSpeedColorScale,0.,1.);
  vec3 color=mix(uSlowColor,uFastColor,x)+uHotColor*x*x*x*.1;
  float pulse=0.;
  if(uEnhanced>.5&&uPulseParams.y>.0001){
    vec2 simP=vec2(p.x*uAspectRatio*uSimulationScale,p.y*uSimulationScale);
    vec2 distanceAndFraction=distanceToSegment(simP,uPulseSegment.xy,uPulseSegment.zw);
    float projected=1.-clamp(distanceAndFraction.y,0.,1.)*.6;
    float sourcePulse=clamp((uPulseParams.z*uPulseParams.z*.02-distanceAndFraction.x*5.)*projected,0.,1.);
    pulse=exp(-distanceAndFraction.x/max(.0001,uPulseParams.x))*sourcePulse*uPulseParams.y;
    color+=uPulseColor*(pulse*(.62+pow(sourcePulse,9.)*.72));
  }
  float turbulent=smoothstep(.42,1.,x),edgeDistance=1.-max(abs(clip.x),abs(clip.y)),edgeBloomFade=smoothstep(.015,.16,edgeDistance);
  float bloom=(turbulent*turbulent*edgeBloomFade+pulse*.72)*uBloomStrength;
  color+=(uFastColor*.24+uHotColor*.16)*bloom;
  gl_PointSize=max(1.,uPointSize);gl_Position=vec4(clip,0,1);vColor=vec4(min(color,vec3(1)),1);
}`;

export const PARTICLE_FLUID_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main(){outColor=vColor;}`;
