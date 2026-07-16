export const SPARKS_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
uniform sampler2D uPositionState; uniform sampler2D uVelocityState; uniform ivec2 uStateSize; uniform int uCapacity;
uniform float uDt; uniform float uGravity; uniform float uDamping; uniform float uRestitution; uniform float uSurfaceFriction;
uniform float uBounceLifeDecay; uniform float uBounceBurstChance; uniform float uBounceBurstMinSpeed; uniform float uBounceBurstCount;
uniform float uBounceBurstCountSpeedScale; uniform float uBounceBurstImpactSpeedScale; uniform float uBounceBurstSpread; uniform float uSparkPower;
uniform float uBounceSparkSpeedScale; uniform float uBounceSparkSpeedVariability; uniform float uBounceSparkLifespan; uniform float uBounceSparkLifespanVariability;
uniform float uTime; uniform float uTurbulence; uniform vec2 uWorldSize; uniform float uBuildRadius; uniform float uSimDepth; uniform int uBuildSurfaceCount; uniform vec4 uBuildSurfaces[13];
uniform float uSpawnActive; uniform int uSpawnStart; uniform int uSpawnCount; uniform vec2 uSpawnPosition; uniform vec2 uSpawnVelocity;
uniform float uSpawnKind; uniform float uSpawnSeed; uniform float uSpawnPaletteSeed; uniform float uSpawnPower; uniform float uSpawnPattern;
uniform float uDirectionChaos; uniform float uLifeScale; uniform float uLifeVariability;
const float PI=3.14159265359;
float hash(float n){return fract(sin(n)*43758.5453123);} float signedHash(float n){return hash(n)*2.0-1.0;}
vec2 direction(float a){return vec2(cos(a),sin(a));}
vec2 rotateVector(vec2 v,float a){float s=sin(a),c=cos(a);return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}
float encodeMarker(vec2 d){float a=atan(d.y,d.x);return .205+clamp((a+PI)/(PI*2.0),0.0,1.0)*.29;}
vec2 decodeMarker(float m){return direction(clamp((m-.205)/.29,0.0,1.0)*PI*2.0-PI);}
float lifeVariation(float seed,float spread){float s=clamp(spread,0.0,1.0);float centered=signedHash(seed+613.0)*.62;float rareLong=step(.84,hash(seed+719.0))*hash(seed+821.0)*.92;float rareShort=step(.88,hash(seed+929.0))*hash(seed+1031.0)*.38;return max(.18,1.0+(centered+rareLong-rareShort)*s);}
vec2 reflectWithFriction(vec2 velocity,vec2 normal,float friction){vec2 bounced=reflect(velocity,normal);vec2 tangent=vec2(-normal.y,normal.x);float tangentSpeed=dot(bounced,tangent)*max(0.0,1.0-friction);float normalSpeed=max(0.0,dot(bounced,normal));return tangent*tangentSpeed+normal*normalSpeed;}
vec2 withMinimumSpeed(vec2 velocity,vec2 fallback,float speed){float current=length(velocity);if(current>=speed||speed<=0.0)return velocity;if(current<=.0001)return normalize(fallback)*speed;return velocity*(speed/current);}
vec2 turbulenceField(vec2 p,float age,float seed){vec2 q=p*.012;float phase=uTime*1.7+age*2.3+seed*.0007;vec2 field=vec2(sin(q.y*1.31+phase)+cos((q.x+q.y)*.73-phase*.82),cos(q.x*1.17-phase*.91)-sin((q.x-q.y)*.61+phase*1.13));float l=length(field);return l>.0001?field/l:vec2(1,0);}
vec2 bendVelocity(vec2 velocity,vec2 flow,float strength){float speed=length(velocity);if(speed<=.0001||strength<=0.0)return velocity;vec2 target=normalize(velocity+flow*speed*mix(.12,.86,strength))*speed;return mix(velocity,target,clamp(strength*uDt*5.5,0.0,.24));}
vec2 closestSegmentParameters(vec2 p1,vec2 q1,vec2 p2,vec2 q2){vec2 d1=q1-p1,d2=q2-p2,r=p1-p2;float a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r),s=0.0,t=0.0;if(a<=.0001&&e<=.0001)return vec2(0);if(a<=.0001){t=clamp(f/max(.0001,e),0.0,1.0);return vec2(0,t);}float c=dot(d1,r);if(e<=.0001){s=clamp(-c/a,0.0,1.0);return vec2(s,0);}float b=dot(d1,d2),denom=a*e-b*b;if(abs(denom)>.0001)s=clamp((b*f-c*e)/denom,0.0,1.0);t=(b*s+f)/e;if(t<0.0){t=0.0;s=clamp(-c/a,0.0,1.0);}else if(t>1.0){t=1.0;s=clamp((b-c)/a,0.0,1.0);}return vec2(s,t);}
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy); int id=cell.y*uStateSize.x+cell.x;
  vec4 position=texelFetch(uPositionState,cell,0); vec4 velocity=texelFetch(uVelocityState,cell,0);
  if(id>=uCapacity){outPosition=position;outVelocity=velocity;return;}
  float age=position.z,life=position.w,kind=velocity.z,seed=velocity.w;
  if(life>0.0){
    float marker=kind>=.5?fract(kind):0.0; float nextMarker=0.0; kind=kind<.5?kind:floor(kind+.01); float generation=kind; vec2 previous=position.xy;
    age+=uDt; velocity.y+=uGravity*uDt; velocity.xy*=exp(-uDamping*uDt);
    if(kind>=.5&&uTurbulence>0.0)velocity.xy=bendVelocity(velocity.xy,turbulenceField(position.xy,age,seed),clamp(uTurbulence*(kind>=2.0?1.32:1.0),0.0,1.0));
    position.xy+=velocity.xy*uDt;
    float burstRoll=hash(seed+floor(age*31.0)*43.17+kind*127.3); bool bounced=false; vec2 normal=vec2(0,-1);
    if(position.x<2.0){position.x=2.0;normal=vec2(1,0);bounced=true;}else if(position.x>uWorldSize.x-2.0){position.x=uWorldSize.x-2.0;normal=vec2(-1,0);bounced=true;}else if(position.y>uWorldSize.y-2.0){position.y=uWorldSize.y-2.0;normal=vec2(0,-1);bounced=true;}
    for(int i=0;i<13;i++){if(i>=uBuildSurfaceCount||bounced)continue;vec4 rail=uBuildSurfaces[i];vec2 start=rail.xy,end=rail.zw,segment=end-start,movement=position.xy-previous;float radius=max(6.0,uBuildRadius+mix(2.0,7.0,clamp(uSimDepth,0.0,1.0)));vec2 closest=closestSegmentParameters(previous,position.xy,start,end);vec2 swept=previous+movement*closest.x;vec2 point=start+segment*closest.y;vec2 delta=swept-point;float distance=length(delta);if(distance<=radius){vec2 segmentNormal=length(segment)>.001?normalize(vec2(-segment.y,segment.x)):vec2(0,-1);vec2 collisionNormal=distance>.001?delta/distance:segmentNormal;if(dot(previous-point,collisionNormal)<0.0)collisionNormal*=-1.0;if(dot(velocity.xy,collisionNormal)>0.0)collisionNormal*=-1.0;normal=collisionNormal;position.xy=point+normal*(radius+.75);bounced=true;}}
    if(bounced){float speed=length(velocity.xy);float restitution=clamp(uRestitution,0.0,1.45);float restitutionT=smoothstep(.08,1.35,restitution);velocity.xy=reflectWithFriction(velocity.xy,normal,uSurfaceFriction)*restitution;velocity.xy=withMinimumSpeed(velocity.xy,normal,speed*mix(.18,.98,restitutionT));vec2 reflected=length(velocity.xy)>.001?normalize(velocity.xy):normal;if(generation>=.5){float remaining=max(0.0,life-age);life=min(life,age+remaining*max(0.0,1.0-clamp(uBounceLifeDecay,0.0,1.0)));}if(generation>=.5&&generation<1.5&&uBounceBurstCount>0.0&&speed>=uBounceBurstMinSpeed&&burstRoll<uBounceBurstChance)nextMarker=encodeMarker(reflected);}
    if(kind>=.5)kind=floor(kind+.01)+nextMarker;
    if(age>=life||position.y>uWorldSize.y+160.0||(length(velocity.xy)<3.0&&age>life*.82)){life=0.0;age=0.0;velocity.xy=vec2(0);}
  }
  int relative=(id-uSpawnStart+uCapacity)%uCapacity;
  if(uSpawnActive>.5&&relative<uSpawnCount){float slot=float(relative),spawnSeed=uSpawnSeed+slot*19.37,t=(slot+hash(spawnSeed))/max(1.0,float(uSpawnCount));float chaos=clamp(uDirectionChaos,0.0,1.0);float angle=-PI*mix(.04,.92,hash(spawnSeed+3.0));angle+=signedHash(spawnSeed+8.0)*mix(.05,1.08,chaos)*mix(.36,1.0,hash(uSpawnSeed+4.0));angle+=signedHash(spawnSeed+15.0)*PI*chaos*.38;vec2 dir=direction(angle),side=direction(hash(spawnSeed+12.0)*PI*2.0);
    if(uSpawnPattern>1.5){dir=normalize(vec2(signedHash(spawnSeed+18.0)*mix(.01,.24,chaos),1.0));side=vec2(signedHash(spawnSeed+12.0),hash(spawnSeed+14.0)*.18);}
    else if(uSpawnPattern>.5){float wheelAngle=t*PI*8.0+uTime*7.5+hash(uSpawnSeed+13.0)*PI*2.0;float wheelSign=signedHash(uSpawnSeed+29.0)<0.0?-1.0:1.0;vec2 radial=direction(wheelAngle),tangent=vec2(-radial.y,radial.x)*wheelSign;dir=normalize(radial*mix(.22,.52,hash(spawnSeed+16.0))+tangent*mix(.86,1.42,hash(spawnSeed+19.0)));side=radial;}
    kind=uSpawnKind;seed=uSpawnPaletteSeed*100000.0+spawnSeed;age=0.0;
    if(kind<.5){life=mix(.14,.32,hash(spawnSeed+22.0))*uLifeScale*lifeVariation(spawnSeed+37.0,uLifeVariability);position.xy=uSpawnPosition+side*mix(0.0,max(8.0,uSpawnPower*1.35),hash(spawnSeed+5.0));velocity.xy=uSpawnVelocity*.018+side*mix(.35,9.0,hash(spawnSeed+9.0));}
    else{float fan=smoothstep(0.0,1.0,t);float speed=uSpawnPower*mix(.24,.92,hash(spawnSeed+21.0));speed*=mix(.62,1.32,sin(fan*PI));float jitter=uSpawnPattern>1.5?mix(0.0,7.0,hash(spawnSeed+31.0)):mix(0.0,12.0,hash(spawnSeed+31.0));position.xy=uSpawnPosition+side*jitter;vec2 inherited=uSpawnPattern>1.5?vec2(0):uSpawnVelocity*mix(.08,.22,hash(spawnSeed+41.0));velocity.xy=inherited+dir*speed;if(uSpawnPattern<=1.5){velocity.xy+=direction(hash(spawnSeed+49.0)*PI*2.0)*uSpawnPower*chaos*mix(.02,.34,hash(spawnSeed+52.0));velocity.x+=signedHash(spawnSeed+52.0)*uSpawnPower*mix(.06,.3,chaos);velocity.y+=signedHash(spawnSeed+61.0)*uSpawnPower*mix(.02,.12,chaos);}life=mix(.85,2.15,hash(spawnSeed+71.0))*uLifeScale*lifeVariation(spawnSeed+73.0,uLifeVariability);if(kind>=2.0){life*=.86;velocity.xy*=mix(1.18,1.82,hash(spawnSeed+81.0));}}
  }
  if(life<=0.0&&uBounceBurstChance>0.0&&uBounceBurstCount>0.0){int capacity=uStateSize.x*uStateSize.y;float base=max(0.0,min(48.0,uBounceBurstCount));for(int attempt=0;attempt<48;attempt++){if(float(attempt)>=base)continue;int parentIndex=(id-4099*(attempt+1))%capacity;if(parentIndex<0)parentIndex+=capacity;ivec2 pc=ivec2(parentIndex%uStateSize.x,parentIndex/uStateSize.x);vec4 pp=texelFetch(uPositionState,pc,0),pv=texelFetch(uVelocityState,pc,0);float parentGeneration=floor(pv.z+.01),marker=fract(pv.z),parentSpeed=length(pv.xy);if(pp.w>0.0&&parentGeneration>=1.0&&parentGeneration<1.5&&marker>.2&&marker<.5&&parentSpeed>=uBounceBurstMinSpeed){float impactT=smoothstep(0.0,max(1.0,uSparkPower*1.35),parentSpeed);float effective=clamp(base*mix(.16,1.0+impactT*max(0.0,uBounceBurstCountSpeedScale),impactT),0.0,48.0);if(float(attempt)>=effective)continue;float probe=float(parentIndex)*.754877666+float(attempt)*19.371+floor(uTime*23.7);vec2 parentDir=decodeMarker(marker);vec2 burstDir=normalize(rotateVector(parentDir,signedHash(probe+29.0)*clamp(uBounceBurstSpread,0.0,3.0)*PI/6.0));float speedVariation=mix(max(.05,1.0-uBounceSparkSpeedVariability),1.0+uBounceSparkSpeedVariability,hash(probe+67.0));float speedScale=max(0.0,uBounceSparkSpeedScale)*mix(.28,1.0,impactT)*(1.0+impactT*max(0.0,uBounceBurstImpactSpeedScale))*speedVariation;float inheritedSpeed=parentSpeed*speedScale*mix(.34,1.18,hash(probe+37.0));float burstSpeed=max(0.0,uSparkPower)*speedScale*mix(.18,1.08,hash(probe+41.0));velocity.xy=burstDir*(inheritedSpeed+burstSpeed)+parentDir*parentSpeed*mix(.02,.18,hash(probe+43.0));position.xy=pp.xy+burstDir*mix(5.0,24.0,hash(probe+47.0));age=0.0;life=mix(.85,2.15,hash(probe+53.0))*max(0.0,uBounceSparkLifespan)*lifeVariation(probe+59.0,uBounceSparkLifespanVariability);kind=parentGeneration+1.0;seed=probe+pv.w*.017+parentGeneration*71.0;break;}}}
  outPosition=vec4(position.xy,age,life);outVelocity=vec4(velocity.xy,kind,seed);
}`;
export const SPARKS_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform vec2 uCanvasSize;
uniform float uPixelScale;
uniform float uPrimarySize;
uniform float uPrimarySizeVariability;
uniform float uPrimaryLength;
uniform float uPrimaryLengthVariability;
uniform float uCoreSize;
uniform float uCoreSizeVariability;
uniform float uBounceSize;
uniform float uBounceSizeVariability;
uniform float uBounceLength;
uniform float uBounceLengthVariability;
uniform float uRenderTier;
uniform float uSimDepth;
out float vLife;
out float vStretch;
out vec2 vDirection;
flat out float vSeed;
flat out float vKind;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  int id = gl_VertexID;
  ivec2 cell = ivec2(id % uStateSize.x, id / uStateSize.x);
  vec4 p = texelFetch(uPositionState, cell, 0);
  vec4 v = texelFetch(uVelocityState, cell, 0);
  if (id >= uParticleCapacity || p.w <= 0.0) {
    gl_Position = vec4(2.0); gl_PointSize = 0.0;
    vLife = 0.0; vStretch = 1.0; vDirection = vec2(1.0); vSeed = 0.0; vKind = 0.0;
    return;
  }
  float generation = v.z < 0.5 ? 0.0 : floor(v.z + 0.01);
  float seedSize = hash(v.w * 71.7);
  float depth = mix(1.0, mix(0.76, 1.22, hash(v.w + 71.0)), clamp(uSimDepth, 0.0, 1.0));
  float baseSize = generation < 0.5 ? uCoreSize : (generation >= 2.0 ? uBounceSize : uPrimarySize);
  float sizeSpread = generation < 0.5 ? uCoreSizeVariability : (generation >= 2.0 ? uBounceSizeVariability : uPrimarySizeVariability);
  float lengthSetting = generation >= 2.0 ? uBounceLength : uPrimaryLength;
  float lengthSpread = generation >= 2.0 ? uBounceLengthVariability : uPrimaryLengthVariability;
  float variance = max(0.12, 1.0 + (seedSize * 2.0 - 1.0) * clamp(sizeSpread, 0.0, 2.0));
  float lengthVariance = max(0.08, 1.0 + (hash(v.w * 43.1 + 17.0) * 2.0 - 1.0) * clamp(lengthSpread, 0.0, 2.0));
  float speedT = clamp(length(v.xy) / 820.0, 0.0, 1.0);
  vStretch = generation < 0.5 ? 1.0 : clamp(1.0 + speedT * max(0.0, lengthSetting) * lengthVariance * mix(0.35, 1.45, clamp(uRenderTier * 0.5, 0.0, 1.0)), 1.0, 14.0);
  gl_Position = vec4(p.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - p.y / uCanvasSize.y * 2.0, 0.0, 1.0);
  gl_PointSize = min((generation < 0.5 ? 64.0 : 118.0) * uPixelScale, max(1.0, baseSize * variance * depth * (1.0 + uRenderTier * 0.12) * vStretch) * uPixelScale);
  vDirection = length(v.xy) > 0.001 ? normalize(vec2(v.x, -v.y)) : vec2(1.0, 0.0);
  vLife = max(0.0, p.w - p.z);
  vSeed = v.w;
  vKind = generation;
}`;
export const SPARKS_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vLife;
in float vStretch;
in vec2 vDirection;
flat in float vSeed;
flat in float vKind;
out vec4 outColor;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uCoreIntensity;
uniform float uGlowBias;
float hash(float value) { return fract(sin(value * 31.17) * 43758.5453); }
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  vec2 normal = vec2(-vDirection.y, vDirection.x);
  vec2 q = vec2(dot(p, vDirection), dot(p, normal) * vStretch);
  float distanceSquared = dot(q, q);
  if (distanceSquared > 1.0) discard;
  int count = max(1, uPaletteCount);
  int index = int(floor(hash(vSeed) * float(count))) % count;
  vec3 palette = uPalette[index];
  float hotness = exp(-distanceSquared * (vKind < 0.5 ? 2.0 : 4.8));
  float lifeAlpha = min(1.0, vLife * 3.0);
  vec3 core = vKind < 0.5 ? vec3(1.0, 0.96, 0.84) * uCoreIntensity : palette;
  vec3 color = mix(palette, core, vKind < 0.5 ? 0.86 : 0.12 + hotness * 0.24);
  outColor = vec4(color * hotness * uGlowBias, smoothstep(1.0, 0.08, distanceSquared) * lifeAlpha);
}`;

export const SPARKS_TRAIL_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform vec2 uCanvasSize;
uniform float uPrimarySize;
uniform float uPrimaryLength;
uniform float uPrimaryLengthVariability;
uniform float uPrimarySizeVariability;
uniform float uBounceSize;
uniform float uBounceLength;
uniform float uBounceLengthVariability;
uniform float uBounceSizeVariability;
uniform float uTrailContinuity;
uniform float uRenderTier;
uniform float uSimDepth;
out vec2 vLocal;
out float vAlpha;
out float vLifeT;
flat out float vKind;
flat out float vSeed;
float hash(float value) { return fract(sin(value) * 43758.5453123); }
float profileVariation(float seed, float variability) {
  return max(0.08, 1.0 + (hash(seed * 29.3 + 103.0) * 2.0 - 1.0) * clamp(variability, 0.0, 2.0));
}
void main() {
  int particleId = gl_VertexID / 6;
  int vertexId = gl_VertexID - particleId * 6;
  const vec2 corners[6] = vec2[6](vec2(0.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(0.0, -1.0), vec2(1.0, 1.0), vec2(0.0, 1.0));
  ivec2 texel = ivec2(particleId % uStateSize.x, particleId / uStateSize.x);
  vec4 position = texelFetch(uPositionState, texel, 0);
  vec4 velocity = texelFetch(uVelocityState, texel, 0);
  float generation = velocity.z < 0.5 ? 0.0 : floor(velocity.z + 0.01);
  if (particleId >= uParticleCapacity || position.w <= 0.0 || generation < 0.5 || uTrailContinuity <= 0.0) {
    gl_Position = vec4(2.0); vAlpha = 0.0; vLocal = vec2(0.0); vLifeT = 1.0; vKind = generation; vSeed = velocity.w; return;
  }
  float speed = length(velocity.xy);
  float lifeT = clamp(position.z / max(0.001, position.w), 0.0, 1.0);
  float profileSize = generation >= 2.0 ? uBounceSize : uPrimarySize;
  float profileLength = generation >= 2.0 ? uBounceLength : uPrimaryLength;
  float sizeVariation = generation >= 2.0 ? uBounceSizeVariability : uPrimarySizeVariability;
  float lengthVariation = generation >= 2.0 ? uBounceLengthVariability : uPrimaryLengthVariability;
  float lengthControl = max(0.0, profileLength * profileVariation(velocity.w + 43.0, lengthVariation));
  float continuity = clamp(uTrailContinuity, 0.0, 2.0);
  float trailSeconds = mix(0.0, 0.048, min(1.0, continuity)) * mix(1.0, 1.72, max(0.0, continuity - 1.0)) * lengthControl;
  float maxTrail = mix(0.0, 168.0, continuity * 0.5) * mix(0.86, 1.32, uRenderTier) * lengthControl;
  float trailLength = clamp(speed * trailSeconds, 0.0, maxTrail);
  if (trailLength <= 0.001) { gl_Position = vec4(2.0); vAlpha = 0.0; vLocal = vec2(0.0); vLifeT = lifeT; vKind = generation; vSeed = velocity.w; return; }
  vec2 axis = speed > 0.001 ? velocity.xy / speed : vec2(1.0, 0.0);
  vec2 normal = vec2(-axis.y, axis.x);
  float depth = mix(1.0, mix(0.76, 1.22, hash(velocity.w + 71.0)), clamp(uSimDepth, 0.0, 1.0));
  float width = max(0.55, profileSize * mix(0.34, 0.74, uRenderTier) * profileVariation(velocity.w, sizeVariation) * depth);
  vec2 corner = corners[vertexId];
  float along = corner.x;
  float side = corner.y;
  vec2 tail = position.xy - axis * trailLength;
  vec2 head = position.xy + axis * min(width * 0.75, trailLength * 0.12);
  vec2 world = mix(tail, head, along) + normal * side * width;
  gl_Position = vec4(world.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - world.y / uCanvasSize.y * 2.0, 0.0, 1.0);
  vAlpha = pow(max(0.0, 1.0 - lifeT), 1.15) * mix(0.22, 0.74, clamp(speed / 760.0, 0.0, 1.0)) * mix(0.72, 1.24, min(1.0, continuity));
  vLocal = vec2(along, side);
  vLifeT = lifeT;
  vKind = generation;
  vSeed = velocity.w;
}`;

export const SPARKS_TRAIL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vAlpha;
in float vLifeT;
flat in float vKind;
flat in float vSeed;
out vec4 outColor;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uGlowBias;
uniform float uCoreIntensity;
float hash(float value) { return fract(sin(value * 31.17) * 43758.5453); }
void main() {
  float widthMask = smoothstep(1.0, 0.28, abs(vLocal.y));
  float tail = smoothstep(0.0, 0.12, vLocal.x) * smoothstep(1.0, 0.58, vLocal.x);
  float hotHead = smoothstep(0.28, 1.0, vLocal.x);
  float alpha = vAlpha * widthMask * tail * mix(0.42, 1.0, hotHead) * uGlowBias;
  if (alpha <= 0.001) discard;
  int count = max(1, uPaletteCount);
  vec3 palette = uPalette[int(floor(hash(vSeed) * float(count))) % count];
  vec3 hot = vec3(1.0, 0.9, 0.55) * min(uCoreIntensity, 2.6);
  vec3 color = mix(palette, hot, mix(0.08, 0.34, hotHead) * (1.0 - smoothstep(0.38, 1.0, vLifeT)));
  if (vKind >= 2.0) color = mix(color, palette, 0.32);
  outColor = vec4(color * alpha, alpha);
}`;
export const SPARKS_RAIL_SHADER = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform vec2 uResolution;uniform int uSurfaceCount;uniform vec4 uSurfaces[13];uniform float uRadius;float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-(a+ab*clamp(dot(p-a,ab)/max(.001,dot(ab,ab)),0.0,1.0)));}void main(){vec2 p=vec2(vUv.x*uResolution.x,(1.0-vUv.y)*uResolution.y);float glow=0.0;for(int i=0;i<13;i++){if(i>=uSurfaceCount)break;vec4 rail=uSurfaces[i];glow=max(glow,smoothstep(uRadius+2.0,uRadius-2.0,segmentDistance(p,rail.xy,rail.zw)));}outColor=vec4(mix(vec3(.12,.18,.24),vec3(.58,.72,.84),glow),glow*.92);}`;
