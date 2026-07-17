export const SPARKS_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
layout(location=2) out vec4 outMetadata;
uniform sampler2D uPositionState; uniform sampler2D uVelocityState; uniform sampler2D uMetadataState; uniform ivec2 uStateSize; uniform int uCapacity;
uniform float uDt; uniform float uGravity; uniform float uDamping; uniform float uRestitution; uniform float uSurfaceFriction;
uniform float uBounceLifeDecay; uniform float uBounceBurstChance; uniform float uBounceBurstMinSpeed; uniform float uBounceBurstCount;
uniform float uBounceBurstCountSpeedScale; uniform float uBounceBurstImpactSpeedScale; uniform float uBounceBurstSpread; uniform float uSparkPower;
uniform float uBounceSparkSpeedScale; uniform float uBounceSparkSpeedVariability; uniform float uBounceSparkLifespan; uniform float uBounceSparkLifespanVariability;
uniform float uTime; uniform float uTurbulence; uniform vec2 uWorldSize; uniform float uBuildRadius; uniform float uSimDepth; uniform int uBuildSurfaceCount; uniform vec4 uBuildSurfaces[13];
uniform highp sampler2D uParticleCommandData; uniform int uParticleCommandCount; uniform int uParticleCommandTexels;
uniform float uDirectionChaos;
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
bool readSpawnCommand(int particleId,out vec4 commandA,out vec4 commandB,out vec4 commandC,out vec4 commandD,out int relative){
  for(int commandIndex=0;commandIndex<64;commandIndex++){
    if(commandIndex>=uParticleCommandCount)break;
    int offset=commandIndex*uParticleCommandTexels;
    vec4 a=texelFetch(uParticleCommandData,ivec2(offset,0),0);
    int start=int(a.y+.5),count=int(a.z+.5),candidate=(particleId-start+uCapacity)%uCapacity;
    if(candidate<count){commandA=a;commandB=texelFetch(uParticleCommandData,ivec2(offset+1,0),0);commandC=texelFetch(uParticleCommandData,ivec2(offset+2,0),0);commandD=texelFetch(uParticleCommandData,ivec2(offset+3,0),0);relative=candidate;return true;}
  }
  return false;
}
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy); int id=cell.y*uStateSize.x+cell.x;
  vec4 position=texelFetch(uPositionState,cell,0); vec4 velocity=texelFetch(uVelocityState,cell,0); vec4 metadata=texelFetch(uMetadataState,cell,0);
  if(id>=uCapacity){outPosition=position;outVelocity=velocity;outMetadata=metadata;return;}
  float age=position.z,life=position.w,kind=metadata.x,generation=metadata.y,seed=metadata.z,eventMarker=0.0;
  if(life>0.0){
    float nextMarker=0.0; vec2 previous=position.xy;
    age+=uDt; velocity.y+=uGravity*uDt; velocity.xy*=exp(-uDamping*uDt);
    if(kind>=.5&&uTurbulence>0.0)velocity.xy=bendVelocity(velocity.xy,turbulenceField(position.xy,age,seed),clamp(uTurbulence*(kind>=2.0?1.32:1.0),0.0,1.0));
    position.xy+=velocity.xy*uDt;
    float burstRoll=hash(seed+floor(age*31.0)*43.17+kind*127.3); bool bounced=false; vec2 normal=vec2(0,-1);
    if(position.x<2.0){position.x=2.0;normal=vec2(1,0);bounced=true;}else if(position.x>uWorldSize.x-2.0){position.x=uWorldSize.x-2.0;normal=vec2(-1,0);bounced=true;}else if(position.y>uWorldSize.y-2.0){position.y=uWorldSize.y-2.0;normal=vec2(0,-1);bounced=true;}
    for(int i=0;i<13;i++){if(i>=uBuildSurfaceCount||bounced)continue;vec4 rail=uBuildSurfaces[i];vec2 start=rail.xy,end=rail.zw,segment=end-start,movement=position.xy-previous;float radius=max(6.0,uBuildRadius+mix(2.0,7.0,clamp(uSimDepth,0.0,1.0)));vec2 closest=closestSegmentParameters(previous,position.xy,start,end);vec2 swept=previous+movement*closest.x;vec2 point=start+segment*closest.y;vec2 delta=swept-point;float distance=length(delta);if(distance<=radius){vec2 segmentNormal=length(segment)>.001?normalize(vec2(-segment.y,segment.x)):vec2(0,-1);vec2 collisionNormal=distance>.001?delta/distance:segmentNormal;if(dot(previous-point,collisionNormal)<0.0)collisionNormal*=-1.0;if(dot(velocity.xy,collisionNormal)>0.0)collisionNormal*=-1.0;normal=collisionNormal;position.xy=point+normal*(radius+.75);bounced=true;}}
    if(bounced){float speed=length(velocity.xy);float restitution=clamp(uRestitution,0.0,1.45);float restitutionT=smoothstep(.08,1.35,restitution);velocity.xy=reflectWithFriction(velocity.xy,normal,uSurfaceFriction)*restitution;velocity.xy=withMinimumSpeed(velocity.xy,normal,speed*mix(.18,.98,restitutionT));vec2 reflected=length(velocity.xy)>.001?normalize(velocity.xy):normal;if(generation>=.5){float remaining=max(0.0,life-age);life=min(life,age+remaining*max(0.0,1.0-clamp(uBounceLifeDecay,0.0,1.0)));}if(generation>=.5&&generation<1.5&&uBounceBurstCount>0.0&&speed>=uBounceBurstMinSpeed&&burstRoll<uBounceBurstChance)nextMarker=encodeMarker(reflected);}
    eventMarker=nextMarker;
    if(age>=life||position.y>uWorldSize.y+160.0||(length(velocity.xy)<3.0&&age>life*.82)){life=0.0;age=0.0;velocity.xy=vec2(0);}
  }
  vec4 commandA=vec4(0),commandB=vec4(0),commandC=vec4(0),commandD=vec4(0);int relative=0;
  if(readSpawnCommand(id,commandA,commandB,commandC,commandD,relative)){float spawnKind=commandA.x,spawnShape=commandA.w,spawnCount=commandA.z;vec2 spawnPosition=commandB.xy,spawnVelocity=commandB.zw;float spawnDirection=commandC.x,spawnSpread=commandC.y,spawnPower=commandC.z,lifeScale=commandC.w,spawnSeedBase=commandD.x,spawnPaletteSeed=commandD.y,lifeVariabilityValue=commandD.z;float spawnPattern=spawnShape>8.5?2.0:spawnShape>7.5?1.0:0.0;float slot=float(relative),spawnSeed=spawnSeedBase+slot*19.37,t=(slot+hash(spawnSeed))/max(1.0,spawnCount);float chaos=clamp(uDirectionChaos,0.0,1.0);float angle=spawnDirection+signedHash(spawnSeed+3.0)*spawnSpread*.5;angle+=signedHash(spawnSeed+8.0)*mix(.05,1.08,chaos)*mix(.36,1.0,hash(spawnSeedBase+4.0));angle+=signedHash(spawnSeed+15.0)*PI*chaos*.38;vec2 dir=direction(angle),side=direction(hash(spawnSeed+12.0)*PI*2.0);
    if(spawnPattern>1.5){dir=normalize(vec2(signedHash(spawnSeed+18.0)*mix(.01,.24,chaos),1.0));side=vec2(signedHash(spawnSeed+12.0),hash(spawnSeed+14.0)*.18);}
    else if(spawnPattern>.5){float wheelAngle=t*PI*8.0+uTime*7.5+hash(spawnSeedBase+13.0)*PI*2.0;float wheelSign=signedHash(spawnSeedBase+29.0)<0.0?-1.0:1.0;vec2 radial=direction(wheelAngle),tangent=vec2(-radial.y,radial.x)*wheelSign;dir=normalize(radial*mix(.22,.52,hash(spawnSeed+16.0))+tangent*mix(.86,1.42,hash(spawnSeed+19.0)));side=radial;}
    kind=spawnKind;generation=spawnKind;seed=spawnPaletteSeed*100000.0+spawnSeed;eventMarker=0.0;age=0.0;
    if(kind<.5){life=mix(.72,1.36,hash(spawnSeed+22.0))*lifeScale*lifeVariation(spawnSeed+37.0,lifeVariabilityValue);position.xy=spawnPosition+side*mix(0.0,max(8.0,spawnPower*1.35),hash(spawnSeed+5.0));velocity.xy=spawnVelocity*.018+side*mix(.35,9.0,hash(spawnSeed+9.0));}
    else{float fan=smoothstep(0.0,1.0,t);float speed=spawnPower*mix(.24,.92,hash(spawnSeed+21.0));speed*=mix(.62,1.32,sin(fan*PI));float jitter=spawnPattern>1.5?mix(0.0,7.0,hash(spawnSeed+31.0)):mix(0.0,12.0,hash(spawnSeed+31.0));position.xy=spawnPosition+side*jitter;vec2 inherited=spawnPattern>1.5?vec2(0):spawnVelocity*mix(.08,.22,hash(spawnSeed+41.0));velocity.xy=inherited+dir*speed;if(spawnPattern<=1.5){velocity.xy+=direction(hash(spawnSeed+49.0)*PI*2.0)*spawnPower*chaos*mix(.02,.34,hash(spawnSeed+52.0));velocity.x+=signedHash(spawnSeed+52.0)*spawnPower*mix(.06,.3,chaos);velocity.y+=signedHash(spawnSeed+61.0)*spawnPower*mix(.02,.12,chaos);}life=mix(.85,2.15,hash(spawnSeed+71.0))*lifeScale*lifeVariation(spawnSeed+73.0,lifeVariabilityValue);if(kind>=2.0){life*=.86;velocity.xy*=mix(1.18,1.82,hash(spawnSeed+81.0));}}
  }
  if(life<=0.0&&uBounceBurstChance>0.0&&uBounceBurstCount>0.0){int capacity=uStateSize.x*uStateSize.y;float base=max(0.0,min(48.0,uBounceBurstCount));for(int attempt=0;attempt<48;attempt++){if(float(attempt)>=base)continue;int parentIndex=(id-4099*(attempt+1))%capacity;if(parentIndex<0)parentIndex+=capacity;ivec2 pc=ivec2(parentIndex%uStateSize.x,parentIndex/uStateSize.x);vec4 pp=texelFetch(uPositionState,pc,0),pv=texelFetch(uVelocityState,pc,0),pm=texelFetch(uMetadataState,pc,0);float parentGeneration=pm.y,marker=pm.w,parentSpeed=length(pv.xy);if(pp.w>0.0&&parentGeneration>=1.0&&parentGeneration<1.5&&marker>.2&&marker<.5&&parentSpeed>=uBounceBurstMinSpeed){float impactT=smoothstep(0.0,max(1.0,uSparkPower*1.35),parentSpeed);float effective=clamp(base*mix(.16,1.0+impactT*max(0.0,uBounceBurstCountSpeedScale),impactT),0.0,48.0);if(float(attempt)>=effective)continue;float probe=float(parentIndex)*.754877666+float(attempt)*19.371+floor(uTime*23.7);vec2 parentDir=decodeMarker(marker);vec2 burstDir=normalize(rotateVector(parentDir,signedHash(probe+29.0)*clamp(uBounceBurstSpread,0.0,3.0)*PI/6.0));float speedVariation=mix(max(.05,1.0-uBounceSparkSpeedVariability),1.0+uBounceSparkSpeedVariability,hash(probe+67.0));float speedScale=max(0.0,uBounceSparkSpeedScale)*mix(.28,1.0,impactT)*(1.0+impactT*max(0.0,uBounceBurstImpactSpeedScale))*speedVariation;float inheritedSpeed=parentSpeed*speedScale*mix(.34,1.18,hash(probe+37.0));float burstSpeed=max(0.0,uSparkPower)*speedScale*mix(.18,1.08,hash(probe+41.0));velocity.xy=burstDir*(inheritedSpeed+burstSpeed)+parentDir*parentSpeed*mix(.02,.18,hash(probe+43.0));position.xy=pp.xy+burstDir*mix(5.0,24.0,hash(probe+47.0));age=0.0;life=mix(.85,2.15,hash(probe+53.0))*max(0.0,uBounceSparkLifespan)*lifeVariation(probe+59.0,uBounceSparkLifespanVariability);kind=2.0;generation=parentGeneration+1.0;seed=probe+pm.z*.017+parentGeneration*71.0;eventMarker=0.0;break;}}}
  outPosition=vec4(position.xy,age,life);outVelocity=vec4(velocity.xy,0.0,0.0);outMetadata=vec4(kind,generation,seed,eventMarker);
}`;
export const SPARKS_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uMetadataState;
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
uniform float uCoreAfterglow;
uniform float uPrimarySizeScale;
out float vAlpha;
out float vKind;
out float vLifeT;
out float vSeed;
out float vSpeed;
out float vTrailStretch;
out float vLengthT;
out vec2 vDirection;
float sparkRenderHash(float n) { return fract(sin(n) * 43758.5453123); }
float sparkSizeVariation(float seed, float variability) {
  float spread = clamp(variability, 0.0, 2.0);
  float spreadT = spread * 0.5;
  float primary = sparkRenderHash(seed + 103.0) * 2.0 - 1.0;
  float base = exp(primary * mix(0.0, 1.18, spreadT));
  float largeRoll = smoothstep(0.58, 1.0, sparkRenderHash(seed + 211.0));
  float smallRoll = smoothstep(0.66, 1.0, sparkRenderHash(seed + 401.0));
  float rareLarge = largeRoll * mix(0.35, 2.35, sparkRenderHash(seed + 307.0)) * spreadT;
  float rareSmall = smallRoll * mix(0.18, 0.78, sparkRenderHash(seed + 503.0)) * spreadT;
  return clamp(base + rareLarge - rareSmall, 0.08, 4.2);
}
void main() {
  int id = gl_VertexID;
  ivec2 cell = ivec2(id % uStateSize.x, id / uStateSize.x);
  vec4 position = texelFetch(uPositionState, cell, 0);
  vec4 velocity = texelFetch(uVelocityState, cell, 0);
  vec4 metadata = texelFetch(uMetadataState, cell, 0);
  float life = position.w;
  float age = position.z;
  float generation = metadata.x;
  float lifeT = life > 0.0 ? clamp(age / life, 0.0, 1.0) : 1.0;
  float fade = 0.0;
  if (life > 0.0) {
    if (generation < 0.5) {
      float flashSeed = fract(sin(metadata.z + 113.0) * 43758.5453123);
      float ignition = smoothstep(0.0, mix(0.018, 0.075, flashSeed), lifeT);
      float flashDecay = pow(max(0.0, 1.0 - lifeT), mix(3.8, 1.45, clamp(uCoreAfterglow, 0.0, 1.0)));
      fade = ignition * flashDecay;
    } else {
      fade = pow(1.0 - lifeT, 1.22);
    }
  }
  if (id >= uParticleCapacity || fade <= 0.0) {
    gl_Position = vec4(2.0); gl_PointSize = 0.0;
    vAlpha = 0.0; vKind = generation; vLifeT = lifeT; vSeed = metadata.z;
    vSpeed = 0.0; vTrailStretch = 1.0; vLengthT = 0.0; vDirection = vec2(1.0);
    return;
  }
  float coreBurstSeed = fract(sin(metadata.z + 33.0) * 43758.5453123);
  float sparkBurstSeed = fract(sin(metadata.z + 71.0) * 43758.5453123);
  float coreVariance = mix(1.0, mix(0.48, 1.86, fract(sin(metadata.z + 133.0) * 43758.5453123)), clamp(uCoreSizeVariability, 0.0, 1.0));
  float coreBurst = mix(9.0, 30.0, coreBurstSeed) * max(0.01, uCoreSize) * coreVariance;
  coreBurst *= mix(1.22, 0.26, smoothstep(0.04, 0.94, lifeT));
  float primarySpark = mix(10.0, 30.0, sparkBurstSeed) * mix(1.0, 0.84, smoothstep(0.1, 0.9, lifeT));
  float bounceSpark = mix(7.0, 18.0, sparkBurstSeed) * mix(1.0, 0.78, smoothstep(0.1, 0.88, lifeT));
  float depthScale = mix(1.0, mix(0.72, 1.24, sparkBurstSeed), clamp(uSimDepth, 0.0, 1.0));
  primarySpark *= depthScale;
  bounceSpark *= depthScale;
  bool bounceProfile = generation >= 2.0;
  float profileSize = bounceProfile ? uBounceSize : uPrimarySize * uPrimarySizeScale;
  float profileLength = bounceProfile ? uBounceLength : uPrimaryLength;
  float profileLengthVariability = bounceProfile ? uBounceLengthVariability : uPrimaryLengthVariability;
  float profileVariability = bounceProfile ? uBounceSizeVariability : uPrimarySizeVariability;
  float generationSize = generation < 0.5 ? coreBurst : (bounceProfile ? bounceSpark : primarySpark);
  float renderSeed = float(id) * 0.754877666 + generation * 41.0;
  float seededSize = sparkSizeVariation(renderSeed, profileVariability);
  generationSize *= generation < 0.5 ? mix(1.0, seededSize, 0.38) : seededSize;
  float lengthSeed = sparkSizeVariation(renderSeed + 701.0, profileLengthVariability);
  float lengthControl = clamp(profileLength * lengthSeed, 0.0, 12.0);
  float lengthT = generation < 0.5 ? 0.0 : smoothstep(0.0, 12.0, lengthControl);
  float speed = length(velocity.xy);
  float speedStretch = generation < 0.5 ? 1.0 : 1.0 + clamp(speed / 980.0, 0.0, 1.0) * mix(0.82, 2.35, uRenderTier) * mix(0.62, 1.18, profileVariability) * lengthControl;
  float pointScale = generation < 0.5 ? mix(0.72, 2.45, smoothstep(0.02, 2.4, clamp(uCoreSize, 0.02, 2.4))) : profileSize;
  gl_Position = vec4(position.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - position.y / uCanvasSize.y * 2.0, 0.0, 1.0);
  float pointLimit = generation < 0.5 ? 180.0 : (generation < 1.5 ? mix(54.0, 340.0, lengthT) : mix(34.0, 168.0, lengthT));
  gl_PointSize = min(pointLimit * uPixelScale, max(1.0, pointScale * generationSize * speedStretch * mix(1.0, 1.85, uRenderTier)) * uPixelScale);
  vAlpha = fade;
  vKind = generation;
  vLifeT = lifeT;
  vSeed = metadata.z;
  vSpeed = speed;
  vTrailStretch = speedStretch;
  vLengthT = lengthT;
  vDirection = speed > 0.001 ? normalize(velocity.xy) : vec2(1.0, 0.0);
}`;
export const SPARKS_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uCoreIntensity;
uniform float uCoreSize;
uniform float uGlowBias;
uniform float uCoreAlpha;
uniform float uCoreOpacity;
uniform float uPrimaryOpacity;
uniform float uBounceOpacity;
uniform float uTime;
in float vAlpha;
in float vKind;
in float vLifeT;
in float vSeed;
in float vSpeed;
in float vTrailStretch;
in float vLengthT;
in vec2 vDirection;
out vec4 outColor;
float hash(float value) { return fract(sin(value) * 43758.5453123); }
float particleSeed(float packed) { return mod(packed, 100000.0); }
float paletteSeed(float packed) { return floor(packed / 100000.0); }
vec3 paletteColor(float seed, float offset) {
  int count = min(uPaletteCount, 8);
  if (count <= 0) return vec3(1.0);
  int primary = int(floor(hash(paletteSeed(seed) + offset) * float(count))) % count;
  int accent = int(floor(hash(paletteSeed(seed) + offset + 19.0) * float(count))) % count;
  return mix(uPalette[primary], uPalette[accent], smoothstep(0.08, 0.92, hash(particleSeed(seed) + offset)));
}
vec3 paletteSparkColor(float seed, float offset) {
  int count = min(uPaletteCount, 8);
  if (count <= 1) return paletteColor(seed, offset);
  int selectable = count - 1;
  int primary = 1 + (int(floor(hash(paletteSeed(seed) + offset) * float(selectable))) % selectable);
  int accent = 1 + (int(floor(hash(paletteSeed(seed) + offset + 29.0) * float(selectable))) % selectable);
  return mix(uPalette[primary], uPalette[accent], smoothstep(0.06, 0.9, hash(particleSeed(seed) + offset)));
}
void main() {
  if (vAlpha <= 0.0) discard;
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  float radius2 = dot(centered, centered);
  if (radius2 > 1.0) discard;
  float core = smoothstep(1.0, 0.015, radius2);
  float halo = smoothstep(1.0, 0.34, radius2) * 0.46;
  if (vKind >= 0.5) {
    vec2 axis = normalize(vDirection);
    vec2 tangent = vec2(-axis.y, axis.x);
    float along = dot(centered, axis);
    float across = dot(centered, tangent);
    float speedT = clamp(vSpeed / 760.0, 0.0, 1.0);
    float lengthT = clamp(vLengthT, 0.0, 1.0);
    float halfLength = mix(0.28, 1.0, lengthT);
    float halfWidth = mix(0.3, 0.095, speedT) / sqrt(max(1.0, vTrailStretch));
    float hotHead = smoothstep(-0.18, 0.82, along);
    float tail = smoothstep(halfLength, halfLength * 0.58, abs(along)) * mix(0.72, 1.0, hotHead);
    float lineCore = tail * smoothstep(halfWidth, 0.018, abs(across));
    float lineHalo = smoothstep(halfLength, halfLength * 0.48, abs(along)) * smoothstep(halfWidth * 3.4, halfWidth * 0.82, abs(across)) * mix(0.28, 0.46, speedT);
    if (lineCore + lineHalo <= 0.001) discard;
    core = lineCore;
    halo = lineHalo;
  }
  vec3 hot = vec3(1.0, 0.985, 0.9) * uCoreIntensity;
  vec3 cooling = vKind < 0.5 ? paletteColor(vSeed, vKind * 17.0 + floor(uTime * 0.7)) : paletteSparkColor(vSeed, vKind * 23.0 + floor(uTime * 0.45));
  vec3 sparkHeat = mix(cooling, vec3(1.0, 0.86, 0.5) * min(uCoreIntensity, 2.4), 0.22);
  vec3 color = vKind < 0.5 ? mix(hot * 2.85, cooling, 0.018) : mix(sparkHeat, cooling, smoothstep(0.0, 0.24, vLifeT));
  if (vKind >= 2.0) color = mix(color, paletteSparkColor(vSeed, 83.0 + floor(uTime * 0.3)), 0.38);
  float sparkle = step(0.82, hash(particleSeed(vSeed) + floor(uTime * (24.0 + vKind * 5.0))));
  color += vec3(sparkle) * (1.0 - vLifeT) * (vKind < 0.5 ? 0.45 : 0.16);
  float alpha = vAlpha * (core + halo) * uGlowBias;
  float profileOpacity=vKind<0.5?uCoreOpacity:(vKind<1.5?uPrimaryOpacity:uBounceOpacity);
  alpha*=profileOpacity;
  if (vKind < 0.5) {
    float coreSizeT = clamp(uCoreSize / 2.4, 0.0, 1.0);
    float coreIntensityT = clamp(uCoreIntensity / 8.0, 0.0, 1.0);
    alpha *= uCoreAlpha * mix(1.35, 2.95, coreIntensityT) * mix(0.85, 1.55, coreSizeT);
  }
  outColor = vec4(color, alpha);
}`;

export const SPARKS_TRAIL_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uMetadataState;
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
uniform float uTime;
out vec2 vLocal;
out float vAlpha;
out float vLifeT;
out float vKind;
out float vSeed;
out float vSpeedT;
float sparkRenderHash(float n) { return fract(sin(n) * 43758.5453123); }
float sparkSizeVariation(float seed, float variability) {
  float spread = clamp(variability, 0.0, 2.0);
  float spreadT = spread * 0.5;
  float primary = sparkRenderHash(seed + 103.0) * 2.0 - 1.0;
  float base = exp(primary * mix(0.0, 1.18, spreadT));
  float largeRoll = smoothstep(0.58, 1.0, sparkRenderHash(seed + 211.0));
  float smallRoll = smoothstep(0.66, 1.0, sparkRenderHash(seed + 401.0));
  float rareLarge = largeRoll * mix(0.35, 2.35, sparkRenderHash(seed + 307.0)) * spreadT;
  float rareSmall = smallRoll * mix(0.18, 0.78, sparkRenderHash(seed + 503.0)) * spreadT;
  return clamp(base + rareLarge - rareSmall, 0.08, 4.2);
}
void main() {
  int particleId = gl_VertexID / 6;
  int vertexId = gl_VertexID - particleId * 6;
  const vec2 corners[6] = vec2[6](vec2(0.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(0.0, -1.0), vec2(1.0, 1.0), vec2(0.0, 1.0));
  ivec2 texel = ivec2(particleId % uStateSize.x, particleId / uStateSize.x);
  vec4 position = texelFetch(uPositionState, texel, 0);
  vec4 velocity = texelFetch(uVelocityState, texel, 0);
  vec4 metadata = texelFetch(uMetadataState, texel, 0);
  float generation = metadata.x;
  float speed = length(velocity.xy);
  float speedT = clamp(speed / 1400.0, 0.0, 1.0);
  if (particleId >= uParticleCapacity || position.w <= 0.0 || generation < 0.5 || speed < 4.0 || uTrailContinuity <= 0.001) {
    gl_Position = vec4(2.0); vAlpha = 0.0; vLocal = vec2(0.0); vLifeT = 1.0; vKind = generation; vSeed = metadata.z; vSpeedT = 0.0; return;
  }
  float lifeT = clamp(position.z / max(0.001, position.w), 0.0, 1.0);
  float profileSize = generation >= 2.0 ? uBounceSize : uPrimarySize;
  float profileLength = generation >= 2.0 ? uBounceLength : uPrimaryLength;
  float sizeVariation = generation >= 2.0 ? uBounceSizeVariability : uPrimarySizeVariability;
  float lengthVariation = generation >= 2.0 ? uBounceLengthVariability : uPrimaryLengthVariability;
  float renderSeed = float(particleId) * 0.754877666 + generation * 41.0;
  float lengthControl = clamp(profileLength * sparkSizeVariation(renderSeed + 701.0, lengthVariation), 0.0, 12.0);
  float seedSize = sparkSizeVariation(renderSeed, sizeVariation);
  float continuity = clamp(uTrailContinuity, 0.0, 2.0);
  float trailSeconds = mix(0.0, 0.048, min(1.0, continuity)) * mix(1.0, 1.72, max(0.0, continuity - 1.0)) * lengthControl;
  float maxTrail = mix(0.0, 168.0, continuity * 0.5) * mix(0.86, 1.32, uRenderTier) * lengthControl;
  float trailLength = clamp(speed * trailSeconds, 0.0, maxTrail);
  if (trailLength <= 0.001) { gl_Position = vec4(2.0); vAlpha = 0.0; vLocal = vec2(0.0); vLifeT = lifeT; vKind = generation; vSeed = metadata.z; vSpeedT = speedT; return; }
  vec2 axis = speed > 0.001 ? velocity.xy / speed : vec2(1.0, 0.0);
  vec2 normal = vec2(-axis.y, axis.x);
  float depth = mix(1.0, mix(0.76, 1.22, sparkRenderHash(metadata.z + 71.0)), clamp(uSimDepth, 0.0, 1.0));
  float width = max(0.55, profileSize * mix(0.34, 0.74, uRenderTier) * seedSize * depth);
  vec2 corner = corners[vertexId];
  float along = corner.x;
  float side = corner.y;
  vec2 tail = position.xy - axis * trailLength;
  vec2 head = position.xy + axis * min(width * 0.75, trailLength * 0.12);
  vec2 world = mix(tail, head, along) + normal * side * width;
  gl_Position = vec4(world.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - world.y / uCanvasSize.y * 2.0, 0.0, 1.0);
  float youngGate = smoothstep(0.0, 0.035, lifeT);
  vAlpha = youngGate * pow(max(0.0, 1.0 - lifeT), 1.15) * mix(0.22, 0.74, speedT) * mix(0.72, 1.24, min(1.0, continuity));
  vLocal = vec2(along, side);
  vLifeT = lifeT;
  vKind = generation;
  vSeed = metadata.z;
  vSpeedT = speedT;
}`;

export const SPARKS_TRAIL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vAlpha;
in float vLifeT;
in float vKind;
in float vSeed;
in float vSpeedT;
out vec4 outColor;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uGlowBias;
uniform float uCoreIntensity;
uniform float uCoreOpacity;
uniform float uPrimaryOpacity;
uniform float uBounceOpacity;
uniform float uTime;
float hash(float value) { return fract(sin(value) * 43758.5453123); }
float particleSeed(float packed) { return mod(packed, 100000.0); }
float paletteSeed(float packed) { return floor(packed / 100000.0); }
vec3 paletteSparkColor(float seed, float offset) {
  int count = min(uPaletteCount, 8);
  if (count <= 0) return vec3(1.0, 0.82, 0.38);
  int selectable = max(1, count - 1);
  int primary = count <= 1 ? 0 : 1 + (int(floor(hash(paletteSeed(seed) + offset) * float(selectable))) % selectable);
  int accent = count <= 1 ? 0 : 1 + (int(floor(hash(paletteSeed(seed) + offset + 29.0) * float(selectable))) % selectable);
  return mix(uPalette[primary], uPalette[accent], smoothstep(0.06, 0.9, hash(particleSeed(seed) + offset)));
}
void main() {
  float widthMask = smoothstep(1.0, 0.18, abs(vLocal.y));
  float tail = smoothstep(0.0, 0.1, vLocal.x);
  float hotHead = smoothstep(0.28, 1.0, vLocal.x);
  float alpha = vAlpha * widthMask * tail * mix(0.42, 1.0, hotHead) * uGlowBias;
  float profileOpacity=vKind<0.5?uCoreOpacity:(vKind<1.5?uPrimaryOpacity:uBounceOpacity);
  alpha*=profileOpacity;
  if (alpha <= 0.001) discard;
  vec3 palette = paletteSparkColor(vSeed, vKind * 23.0 + floor(uTime * 0.45));
  vec3 hot = vec3(1.0, 0.9, 0.55) * min(uCoreIntensity, 2.6);
  vec3 color = mix(palette, hot, mix(0.08, 0.34, hotHead) * (1.0 - smoothstep(0.38, 1.0, vLifeT)));
  if (vKind >= 2.0) color = mix(color, paletteSparkColor(vSeed, 83.0 + floor(uTime * 0.3)), 0.32);
  color += vec3(1.0, 0.9, 0.42) * widthMask * hotHead * vSpeedT * 0.08;
  outColor = vec4(color, alpha);
}`;
export const SPARKS_RAIL_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform int uSurfaceCount;
uniform vec4 uSurfaces[13];
uniform float uRadius;
uniform vec3 uBackground;
uniform vec3 uBodyColor;
uniform vec3 uEdgeColor;
float segmentDistance(vec2 p,vec2 a,vec2 b){
  vec2 ab=b-a;
  return length(p-(a+ab*clamp(dot(p-a,ab)/max(.001,dot(ab,ab)),0.0,1.0)));
}
void main(){
  vec2 p=vec2(vUv.x*uResolution.x,(1.0-vUv.y)*uResolution.y);
  float distanceToSurface=100000.0;
  for(int i=0;i<13;i++){
    if(i>=uSurfaceCount)break;
    vec4 rail=uSurfaces[i];
    distanceToSurface=min(distanceToSurface,segmentDistance(p,rail.xy,rail.zw));
  }
  float coverage=smoothstep(uRadius+1.25,uRadius-1.25,distanceToSurface);
  float normalizedDepth=clamp(1.0-distanceToSurface/max(1.0,uRadius),0.0,1.0);
  float rim=smoothstep(uRadius,uRadius-1.8,distanceToSurface)*(1.0-smoothstep(uRadius-1.8,uRadius-4.5,distanceToSurface));
  vec3 base=mix(uBackground,uBodyColor,0.34);
  vec3 color=mix(base,uBodyColor,0.22+normalizedDepth*0.18);
  color=mix(color,uEdgeColor,rim*0.32);
  outColor=vec4(color,coverage);
}`;
