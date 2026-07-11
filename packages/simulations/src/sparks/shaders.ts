export const SPARKS_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
uniform sampler2D uPositionState; uniform sampler2D uVelocityState; uniform ivec2 uStateSize; uniform int uCapacity;
uniform float uDt; uniform float uGravity; uniform float uDamping; uniform float uRestitution; uniform float uSurfaceFriction;
uniform float uBounceLifeDecay; uniform float uBounceBurstChance; uniform float uBounceBurstMinSpeed; uniform float uBounceBurstCount;
uniform float uBounceBurstCountSpeedScale; uniform float uBounceBurstImpactSpeedScale; uniform float uBounceBurstSpread;
uniform float uBounceSparkSpeedScale; uniform float uBounceSparkSpeedVariability; uniform float uBounceSparkLifespan; uniform float uBounceSparkLifespanVariability;
uniform float uTime; uniform float uTurbulence; uniform vec2 uWorldSize; uniform float uBuildRadius; uniform int uBuildSurfaceCount; uniform vec4 uBuildSurfaces[13];
uniform float uSpawnActive; uniform int uSpawnStart; uniform int uSpawnCount; uniform vec2 uSpawnPosition; uniform vec2 uSpawnVelocity;
uniform float uSpawnKind; uniform float uSpawnSeed; uniform float uSpawnPaletteSeed; uniform float uSpawnPower; uniform float uSpawnPattern;
uniform float uDirectionChaos; uniform float uLifeScale; uniform float uLifeVariability;
const float PI=3.14159265359;
float hash(float n){return fract(sin(n)*43758.5453);} float signedHash(float n){return hash(n)*2.0-1.0;}
vec2 direction(float a){return vec2(cos(a),sin(a));}
vec2 rotateVector(vec2 v,float a){float s=sin(a),c=cos(a);return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}
float encodeMarker(vec2 d){return .205+clamp((atan(d.y,d.x)+PI)/(PI*2.0),0.0,1.0)*.29;}
vec2 decodeMarker(float m){return direction(clamp((m-.205)/.29,0.0,1.0)*PI*2.0-PI);}
float lifeVariation(float seed,float spread){return max(.18,1.0+signedHash(seed+613.0)*.62*clamp(spread,0.0,1.0));}
vec2 nearestPoint(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return a+ab*clamp(dot(p-a,ab)/max(.0001,dot(ab,ab)),0.0,1.0);}
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy); int id=cell.y*uStateSize.x+cell.x;
  vec4 position=texelFetch(uPositionState,cell,0); vec4 velocity=texelFetch(uVelocityState,cell,0);
  if(id>=uCapacity){outPosition=position;outVelocity=velocity;return;}
  float age=position.z,life=position.w,kind=velocity.z,seed=velocity.w;
  if(life>0.0){
    float generation=floor(kind+.01); kind=generation; age+=uDt;
    velocity.y+=uGravity*uDt; velocity.xy*=exp(-uDamping*uDt);
    if(generation>=1.0&&uTurbulence>0.0){vec2 flow=normalize(vec2(sin(position.y*.012+uTime+seed*.001),cos(position.x*.011-uTime*.8+seed*.001)));velocity.xy=mix(velocity.xy,normalize(velocity.xy+flow*length(velocity.xy)*uTurbulence)*length(velocity.xy),min(.22,uTurbulence*uDt*5.5));}
    vec2 previous=position.xy; position.xy+=velocity.xy*uDt; bool bounced=false; vec2 normal=vec2(0,-1);
    if(position.x<2.0){position.x=2.0;normal=vec2(1,0);bounced=true;}else if(position.x>uWorldSize.x-2.0){position.x=uWorldSize.x-2.0;normal=vec2(-1,0);bounced=true;}else if(position.y>uWorldSize.y-2.0){position.y=uWorldSize.y-2.0;normal=vec2(0,-1);bounced=true;}
    for(int i=0;i<13;i++){if(i>=uBuildSurfaceCount||bounced)continue;vec4 rail=uBuildSurfaces[i];vec2 point=nearestPoint(position.xy,rail.xy,rail.zw);vec2 delta=position.xy-point;float distance=length(delta);if(distance<=uBuildRadius){normal=distance>.001?delta/distance:normalize(vec2(-(rail.w-rail.y),rail.z-rail.x));if(dot(velocity.xy,normal)>0.0)normal*=-1.0;position.xy=point+normal*(uBuildRadius+.75);bounced=true;}}
    if(bounced){float speed=length(velocity.xy);velocity.xy=(velocity.xy-2.0*dot(velocity.xy,normal)*normal)*uRestitution;vec2 tangent=vec2(-normal.y,normal.x);velocity.xy-=tangent*dot(velocity.xy,tangent)*uSurfaceFriction;life=min(life,age+max(0.0,life-age)*(1.0-uBounceLifeDecay));if(generation>=1.0&&generation<1.5&&speed>=uBounceBurstMinSpeed&&hash(seed+floor(age*31.0))<uBounceBurstChance)kind=1.0+encodeMarker(normalize(velocity.xy));}
    if(age>=life||position.y>uWorldSize.y+160.0){age=0.0;life=0.0;velocity.xy=vec2(0);}
  }
  int relative=(id-uSpawnStart+uCapacity)%uCapacity;
  if(uSpawnActive>.5&&relative<uSpawnCount){float slot=float(relative),spawnSeed=uSpawnSeed+slot*19.37,t=(slot+hash(spawnSeed))/max(1.0,float(uSpawnCount));float chaos=clamp(uDirectionChaos,0.0,1.0);vec2 dir;vec2 side;
    if(uSpawnPattern>1.5){dir=normalize(vec2(signedHash(spawnSeed+18.0)*mix(.01,.24,chaos),1.0));side=vec2(signedHash(spawnSeed+12.0),hash(spawnSeed+14.0)*.18);}
    else if(uSpawnPattern>.5){float a=t*PI*8.0+uTime*7.5;vec2 radial=direction(a);dir=normalize(radial*.35+vec2(-radial.y,radial.x));side=radial;}
    else{float a=-PI*mix(.04,.92,hash(spawnSeed+3.0))+signedHash(spawnSeed+8.0)*chaos*1.08;dir=direction(a);side=direction(hash(spawnSeed+12.0)*PI*2.0);}
    kind=uSpawnKind;seed=uSpawnPaletteSeed*100000.0+spawnSeed;age=0.0;position.xy=uSpawnPosition+side*mix(0.0,10.0,hash(spawnSeed+5.0));
    if(kind<.5){life=mix(.14,.32,hash(spawnSeed+22.0))*uLifeScale*lifeVariation(spawnSeed,uLifeVariability);velocity.xy=uSpawnVelocity*.018+side*mix(.35,9.0,hash(spawnSeed+9.0));}
    else{float speed=uSpawnPower*mix(.24,.92,hash(spawnSeed+21.0));velocity.xy=(uSpawnPattern>1.5?vec2(0):uSpawnVelocity*.15)+dir*speed;life=mix(.85,2.15,hash(spawnSeed+71.0))*uLifeScale*lifeVariation(spawnSeed,uLifeVariability);}
  }
  if(life<=0.0&&uBounceBurstChance>0.0&&uBounceBurstCount>0.0){int capacity=uStateSize.x*uStateSize.y;for(int attempt=0;attempt<48;attempt++){if(float(attempt)>=uBounceBurstCount)continue;int parentIndex=(id-4099*(attempt+1))%capacity;if(parentIndex<0)parentIndex+=capacity;ivec2 pc=ivec2(parentIndex%uStateSize.x,parentIndex/uStateSize.x);vec4 pp=texelFetch(uPositionState,pc,0),pv=texelFetch(uVelocityState,pc,0);float marker=fract(pv.z),generation=floor(pv.z+.01),parentSpeed=length(pv.xy);if(pp.w>0.0&&generation>=1.0&&generation<1.5&&marker>.2&&marker<.5&&parentSpeed>=uBounceBurstMinSpeed){float probe=float(parentIndex)*.754+float(attempt)*19.37;vec2 parentDir=decodeMarker(marker);vec2 burstDir=normalize(rotateVector(parentDir,signedHash(probe+29.0)*uBounceBurstSpread*PI/6.0));float speedScale=uBounceSparkSpeedScale*(1.0+uBounceBurstImpactSpeedScale)*mix(max(.05,1.0-uBounceSparkSpeedVariability),1.0+uBounceSparkSpeedVariability,hash(probe+67.0));position.xy=pp.xy+burstDir*mix(5.0,24.0,hash(probe+47.0));velocity.xy=burstDir*parentSpeed*speedScale;age=0.0;life=mix(.85,2.15,hash(probe+53.0))*uBounceSparkLifespan*lifeVariation(probe,uBounceSparkLifespanVariability);kind=2.0;seed=probe+pv.w*.017;break;}}}
  outPosition=vec4(position.xy,age,life);outVelocity=vec4(velocity.xy,kind,seed);
}`;
export const SPARKS_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform ivec2 uStateSize;uniform int uParticleCapacity;uniform vec2 uCanvasSize;uniform float uPrimarySize;uniform float uCoreSize;uniform float uBounceSize;uniform float uSizeVariability;uniform float uRenderTier;out float vLife;flat out float vSeed;flat out float vKind;
void main(){int id=gl_VertexID;ivec2 cell=ivec2(id%uStateSize.x,id/uStateSize.x);vec4 p=texelFetch(uPositionState,cell,0),v=texelFetch(uVelocityState,cell,0);if(id>=uParticleCapacity||p.w<=0.0){gl_Position=vec4(2,2,0,1);gl_PointSize=0.0;vLife=0.0;vSeed=0.0;vKind=0.0;return;}gl_Position=vec4(p.x/uCanvasSize.x*2.0-1.0,1.0-p.y/uCanvasSize.y*2.0,0,1);float base=v.z<.5?uCoreSize:(v.z>=2.0?uBounceSize:uPrimarySize);float variance=1.0+(fract(sin(v.w*71.7)*43758.5)*2.0-1.0)*uSizeVariability;gl_PointSize=max(1.0,base*variance*(1.0+uRenderTier*.32));vLife=max(0.0,p.w-p.z);vSeed=v.w;vKind=v.z;}`;
export const SPARKS_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;in float vLife;flat in float vSeed;flat in float vKind;out vec4 outColor;uniform vec3 uPalette[8];uniform int uPaletteCount;uniform float uCoreIntensity;uniform float uGlowBias;float hash(float v){return fract(sin(v*31.17)*43758.5453);}void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;int index=int(floor(hash(vSeed)*float(max(1,uPaletteCount))))%max(1,uPaletteCount);vec3 color=uPalette[index];float core=exp(-d*(vKind<.5?2.0:4.8));float intensity=vKind<.5?uCoreIntensity:1.0;outColor=vec4(color*core*intensity*uGlowBias,smoothstep(1.0,.08,d)*min(1.0,vLife*3.0));}`;
export const SPARKS_RAIL_SHADER = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform vec2 uResolution;uniform int uSurfaceCount;uniform vec4 uSurfaces[13];uniform float uRadius;float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-(a+ab*clamp(dot(p-a,ab)/max(.001,dot(ab,ab)),0.0,1.0)));}void main(){vec2 p=vec2(vUv.x*uResolution.x,(1.0-vUv.y)*uResolution.y);float glow=0.0;for(int i=0;i<13;i++){if(i>=uSurfaceCount)break;vec4 rail=uSurfaces[i];glow=max(glow,smoothstep(uRadius+2.0,uRadius-2.0,segmentDistance(p,rail.xy,rail.zw)));}outColor=vec4(mix(vec3(.12,.18,.24),vec3(.58,.72,.84),glow),glow*.92);}`;
