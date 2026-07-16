export const FIREWORKS_STEP_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
layout(location=2) out vec4 outMetadata;
uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform sampler2D uMetadataState;uniform ivec2 uStateSize;uniform int uCapacity;
uniform sampler2D uParticleCommandData;uniform int uParticleCommandCount;uniform int uParticleCommandTexels;
uniform float uDt;uniform float uGravity;uniform float uDamping;uniform float uBurstChaos;uniform float uPatternVariation;
uniform float uSecondaryChance;uniform float uSecondaryDelay;uniform float uSecondaryDepth;uniform float uTerminalChance;
const float PI=3.14159265359;
float hash(float value){return fract(sin(value*91.3458+17.123)*47453.5453);}vec2 direction(float angle){return vec2(cos(angle),sin(angle));}
bool readCommand(int id,out vec4 a,out vec4 b,out vec4 c,out vec4 d,out int relative){for(int commandIndex=0;commandIndex<64;commandIndex++){if(commandIndex>=uParticleCommandCount)break;int offset=commandIndex*uParticleCommandTexels;a=texelFetch(uParticleCommandData,ivec2(offset,0),0);int start=int(a.y+.5),count=int(a.z+.5),candidate=(id-start+uCapacity)%uCapacity;if(candidate<count){b=texelFetch(uParticleCommandData,ivec2(offset+1,0),0);c=texelFetch(uParticleCommandData,ivec2(offset+2,0),0);d=texelFetch(uParticleCommandData,ivec2(offset+3,0),0);relative=candidate;return true;}}return false;}
vec2 burstVelocity(float pattern,float slot,float count,float seed,float power,float chaos,float variation){
  float t=(slot+hash(seed+1.0))/max(1.0,count),angle=t*PI*2.0,radial=mix(.52,1.25,hash(seed+4.7));
  if(pattern<.5){angle=hash(seed)*PI*2.0;}
  else if(pattern<1.5){radial=mix(.92,1.08,hash(seed+4.7));}
  else if(pattern<2.5){angle+=sin(t*PI*12.0)*.08;radial=mix(.55,1.28,pow(hash(seed+4.7),.72));}
  else if(pattern<3.5){angle=mix(-PI*.92,-PI*.08,t)+sin(t*PI*10.0)*.08;radial=mix(.48,1.2,hash(seed+4.7));}
  else if(pattern<4.5){float spoke=floor(t*7.0);angle=spoke/7.0*PI*2.0+(hash(seed+3.0)-.5)*.12;radial=mix(.42,1.35,hash(seed+4.7));}
  else if(pattern<5.5){angle=t*PI*8.0+hash(seed+2.0)*.26;radial=mix(.38,1.24,t);}
  else if(pattern<6.5){float arm=floor(t*4.0);angle=arm*PI*.5+(hash(seed+3.0)-.5)*mix(.04,.38,variation);radial=mix(.48,1.3,hash(seed+4.7));}
  else{angle=mix(-PI*.72,-PI*.28,t)+(hash(seed+3.0)-.5)*.18;radial=mix(.72,1.32,hash(seed+4.7));}
  angle+=(hash(seed+9.1)-.5)*chaos*mix(.12,.68,variation);float asymmetry=mix(1.0-chaos*.32,1.0+chaos*.38,hash(seed+11.0));return direction(angle)*power*radial*asymmetry;
}
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy);int id=cell.y*uStateSize.x+cell.x;vec4 position=texelFetch(uPositionState,cell,0),velocity=texelFetch(uVelocityState,cell,0),metadata=texelFetch(uMetadataState,cell,0);
  if(id>=uCapacity){outPosition=position;outVelocity=velocity;outMetadata=metadata;return;}
  metadata.w=0.0;float archetype=metadata.x,generation=metadata.y;
  if(position.w>0.0){float previousAge=position.z;position.z+=uDt;velocity.y+=uGravity*uDt;float drag=archetype<.5?0.0:uDamping*(archetype>2.5?1.8:archetype>1.5?1.2:1.0);velocity.xy*=exp(-max(0.0,drag)*uDt);position.xy+=velocity.xy*uDt;
    float secondaryAge=position.w*clamp(uSecondaryDelay,.08,.92);if(archetype>=1.0&&archetype<3.0&&generation<uSecondaryDepth&&previousAge<secondaryAge&&position.z>=secondaryAge&&hash(metadata.z+generation*41.0)<uSecondaryChance)metadata.w=1.0;
    if(position.z>=position.w){if(archetype>=1.0&&archetype<3.0&&hash(metadata.z+generation*79.0)<uTerminalChance)metadata.w=2.0;position.w=0.0;position.z=0.0;velocity.xy=vec2(0);}
  }
  vec4 a=vec4(0),b=vec4(0),c=vec4(0),d=vec4(0);int relative=0;
  if(readCommand(id,a,b,c,d,relative)){float archetypeId=a.x,count=a.z,power=c.z,lifetime=c.w,seed=d.x+float(relative)*1.6180339,paletteSeed=d.y,lifeVariability=d.z,pattern=d.w;vec2 initial=b.zw;position=vec4(b.xy,0.0,lifetime*mix(max(.12,1.0-lifeVariability),1.0+lifeVariability,hash(seed+2.2)));velocity=vec4(initial,0.0,0.0);metadata=vec4(archetypeId,0.0,paletteSeed+hash(seed+7.0)*31.0,0.0);if(archetypeId>=1.0)velocity.xy+=burstVelocity(pattern,float(relative),count,seed,power,uBurstChaos,uPatternVariation);}
  outPosition=position;outVelocity=velocity;outMetadata=metadata;
}`;

export const FIREWORKS_EVENT_SHADER = `#version 300 es
precision highp float;precision highp sampler2D;in vec2 vUv;layout(location=0) out vec4 outPosition;layout(location=1) out vec4 outVelocity;layout(location=2) out vec4 outMetadata;
uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform sampler2D uMetadataState;uniform ivec2 uStateSize;uniform int uCapacity;
uniform float uSecondaryCount;uniform float uSecondaryScale;uniform float uSecondaryInheritance;uniform float uSecondarySpread;uniform float uSecondaryPower;uniform float uSecondaryLife;uniform float uSparkleCount;uniform float uSparklePower;uniform float uSparkleLife;
const float PI=3.14159265359;float hash(float v){return fract(sin(v*71.17+13.7)*43758.5453);}vec2 direction(float a){return vec2(cos(a),sin(a));}
void main(){ivec2 cell=ivec2(gl_FragCoord.xy);int id=cell.y*uStateSize.x+cell.x;vec4 position=texelFetch(uPositionState,cell,0),velocity=texelFetch(uVelocityState,cell,0),metadata=texelFetch(uMetadataState,cell,0);if(id>=uCapacity){outPosition=position;outVelocity=velocity;outMetadata=metadata;return;}
  if(position.w<=0.0&&metadata.w<.5){for(int attempt=0;attempt<32;attempt++){int parentIndex=(id-4099*(attempt+1))%uCapacity;if(parentIndex<0)parentIndex+=uCapacity;ivec2 parentCell=ivec2(parentIndex%uStateSize.x,parentIndex/uStateSize.x);vec4 pp=texelFetch(uPositionState,parentCell,0),pv=texelFetch(uVelocityState,parentCell,0),pm=texelFetch(uMetadataState,parentCell,0);float child=float(attempt),seed=pm.z+child*19.371+pm.y*83.0;if(pm.w>.5&&pm.w<1.5&&child<uSecondaryCount){float angle=hash(seed)*PI*2.0;vec2 radial=direction(angle+(hash(seed+4.0)-.5)*uSecondarySpread*PI);position=vec4(pp.xy,0.0,uSecondaryLife*pow(max(.18,uSecondaryScale),pm.y+1.0)*mix(.72,1.24,hash(seed+7.0)));velocity=vec4(pv.xy*uSecondaryInheritance+radial*uSecondaryPower*mix(.62,1.28,hash(seed+9.0)),0,0);metadata=vec4(2.0,pm.y+1.0,pm.z+child*7.3,0);break;}if(pm.w>1.5&&child<uSparkleCount){vec2 radial=direction(hash(seed)*PI*2.0);position=vec4(pp.xy,0.0,uSparkleLife*mix(.68,1.32,hash(seed+7.0)));velocity=vec4(pv.xy*.18+radial*uSparklePower*mix(.42,1.34,hash(seed+9.0)),0,0);metadata=vec4(3.0,pm.y+1.0,pm.z+child*11.7,0);break;}}}
  outPosition=position;outVelocity=velocity;outMetadata=metadata;
}`;

export const FIREWORKS_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform sampler2D uMetadataState;uniform ivec2 uStateSize;uniform int uParticleCapacity;uniform vec2 uCanvasSize;uniform float uPixelScale;uniform float uParticleSize;uniform float uTerminalSize;uniform float uSizeVariability;uniform float uRenderTier;
out float vLifeT;flat out float vSeed;flat out float vKind;out vec2 vDirection;out float vSpeed;
void main(){int id=gl_VertexID;ivec2 cell=ivec2(id%uStateSize.x,id/uStateSize.x);vec4 position=texelFetch(uPositionState,cell,0),velocity=texelFetch(uVelocityState,cell,0),metadata=texelFetch(uMetadataState,cell,0);float lifeT=position.w>0.0?clamp(position.z/position.w,0.0,1.0):1.0;if(id>=uParticleCapacity||position.w<=0.0){gl_Position=vec4(2);gl_PointSize=0.0;vLifeT=1.0;vSeed=0.0;vKind=0.0;vDirection=vec2(1,0);vSpeed=0.0;return;}gl_Position=vec4(position.x/uCanvasSize.x*2.0-1.0,1.0-position.y/uCanvasSize.y*2.0,0,1);float variance=max(.08,1.0+(fract(sin(metadata.z*71.7)*43758.5)*2.0-1.0)*uSizeVariability);float profile=metadata.x<.5?2.4:metadata.x>2.5?uTerminalSize:uParticleSize;float fade=mix(1.0,.28,lifeT);gl_PointSize=max(1.0,profile*variance*fade*mix(1.0,1.42,uRenderTier)*uPixelScale);vLifeT=lifeT;vSeed=metadata.z;vKind=metadata.x;vSpeed=length(velocity.xy);vDirection=vSpeed>.001?normalize(velocity.xy):vec2(1,0);}`;

export const FIREWORKS_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;in float vLifeT;flat in float vSeed;flat in float vKind;in vec2 vDirection;in float vSpeed;out vec4 outColor;uniform vec3 uPalette[8];uniform int uPaletteCount;uniform float uCrackle;uniform float uPaletteTransition;uniform int uColorMode;
float hash(float v){return fract(sin(v*31.17)*43758.5453);}vec3 palette(int index){return uPalette[index%max(1,uPaletteCount)];}
void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;int count=max(1,uPaletteCount),primary=int(floor(hash(vSeed)*float(count)))%count,accent=(primary+1+int(floor(hash(vSeed+19.0)*float(max(1,count-1)))))%count;float transition=uColorMode==0?0.0:uColorMode==1?hash(vSeed+vSpeed*.01):uColorMode==2?vLifeT:clamp(vKind*.34,0.0,1.0);vec3 color=mix(palette(primary),palette(accent),clamp(transition*uPaletteTransition,0.0,1.0));if(vKind>2.5)color=mix(vec3(1.0,.78,.32),vec3(1.0),hash(vSeed+3.0));float core=exp(-d*(vKind<.5?2.0:4.5));float flicker=vKind>2.5?mix(max(.12,1.0-uCrackle),1.0+uCrackle,hash(vSeed+floor(vLifeT*36.0))):1.0;float alpha=smoothstep(1.0,.1,d)*pow(max(0.0,1.0-vLifeT),vKind>2.5?1.8:1.15);outColor=vec4(color*core*flicker,alpha);}`;

export const FIREWORKS_STREAK_VERTEX_SHADER = `#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform sampler2D uMetadataState;uniform ivec2 uStateSize;uniform int uParticleCapacity;uniform vec2 uCanvasSize;uniform float uParticleSize;uniform float uParticleLength;uniform float uRenderTier;out vec2 vLocal;out float vAlpha;flat out float vSeed;flat out float vKind;out float vLifeT;
void main(){int particleId=gl_VertexID/6,vertexId=gl_VertexID-particleId*6;const vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(1,1),vec2(0,-1),vec2(1,1),vec2(0,1));ivec2 cell=ivec2(particleId%uStateSize.x,particleId/uStateSize.x);vec4 position=texelFetch(uPositionState,cell,0),velocity=texelFetch(uVelocityState,cell,0),metadata=texelFetch(uMetadataState,cell,0);float speed=length(velocity.xy),lifeT=position.w>0.0?clamp(position.z/position.w,0.0,1.0):1.0;if(particleId>=uParticleCapacity||position.w<=0.0||metadata.x>2.5||speed<2.0||uParticleLength<=.001){gl_Position=vec4(2);vAlpha=0.0;vLocal=vec2(0);vSeed=0.0;vKind=0.0;vLifeT=1.0;return;}vec2 axis=velocity.xy/speed,normal=vec2(-axis.y,axis.x),corner=corners[vertexId];float lengthPx=clamp(speed*.024*uParticleLength,2.0,180.0),width=max(.45,uParticleSize*mix(.32,.62,uRenderTier));vec2 tail=position.xy-axis*lengthPx,world=mix(tail,position.xy+axis*width*.5,corner.x)+normal*corner.y*width;gl_Position=vec4(world.x/uCanvasSize.x*2.0-1.0,1.0-world.y/uCanvasSize.y*2.0,0,1);vLocal=corner;vAlpha=pow(max(0.0,1.0-lifeT),1.22)*mix(.38,.9,clamp(speed/700.0,0.0,1.0));vSeed=metadata.z;vKind=metadata.x;vLifeT=lifeT;}`;

export const FIREWORKS_STREAK_FRAGMENT_SHADER = `#version 300 es
precision highp float;in vec2 vLocal;in float vAlpha;flat in float vSeed;flat in float vKind;in float vLifeT;out vec4 outColor;uniform vec3 uPalette[8];uniform int uPaletteCount;uniform float uPaletteTransition;uniform int uColorMode;float hash(float v){return fract(sin(v*31.17)*43758.5453);}void main(){float mask=smoothstep(1.0,.12,abs(vLocal.y))*smoothstep(0.0,.1,vLocal.x);if(mask<=.001)discard;int count=max(1,uPaletteCount),primary=int(floor(hash(vSeed)*float(count)))%count,accent=(primary+1)%count;float transition=uColorMode==2?vLifeT:uColorMode==3?clamp(vKind*.34,0.0,1.0):hash(vSeed+17.0);vec3 color=mix(uPalette[primary],uPalette[accent],transition*uPaletteTransition);outColor=vec4(color*mix(.72,1.32,vLocal.x),vAlpha*mask);}`;
