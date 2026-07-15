export const ORBITAL_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0)out vec4 outPosition;
layout(location=1)out vec4 outVelocity;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform float uDt;
uniform float uTime;
uniform float uAspect;
uniform float uGravity;
uniform float uDamping;
uniform float uMaxSpeed;
uniform float uPlanetRadius;
uniform int uBodyCount;
uniform float uBodyStrength;
uniform float uBodyRadius;
uniform float uBodySpeed;
uniform float uSpawnActive;
uniform int uSpawnStart;
uniform int uSpawnCount;
uniform vec2 uSpawnCenter;
uniform vec2 uSpawnVelocity;
uniform float uSpawnVelocityScale;
uniform float uSpawnRadius;
uniform float uSpawnJitter;
uniform float uSpawnAsteroid;
uniform float uSpawnSeed;
uniform float uPointerActive;
uniform int uPointerMode;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform float uInfluenceRadius;
uniform float uInfluenceStrength;

float hash(float n){return fract(sin(n)*43758.5453);}
vec2 dir(float a){return vec2(cos(a),sin(a));}
vec2 toDisk(vec2 p){return vec2(p.x/max(.001,uAspect),p.y);}
vec2 fromDisk(vec2 p){return vec2(p.x*uAspect,p.y);}
float diskLength(vec2 p){return length(toDisk(p));}
vec2 diskNormalize(vec2 p){vec2 d=toDisk(p);return fromDisk(d/max(.0001,length(d)));}

void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy);
  int id=cell.y*uStateSize.x+cell.x;
  vec4 position=texelFetch(uPositionState,cell,0);
  vec4 velocity=texelFetch(uVelocityState,cell,0);
  if(id>=uCapacity){outPosition=position;outVelocity=velocity;return;}
  int relative=(id-uSpawnStart+uCapacity)%uCapacity;
  if(uSpawnActive>.5&&relative<uSpawnCount){
    float seed=uSpawnSeed+float(relative)*1.618;
    float angle=hash(seed)*6.2831853;
    float radius=sqrt(hash(seed+4.0))*mix(uSpawnRadius,.018,uSpawnAsteroid);
    vec2 burst=fromDisk(dir(angle)*radius);
    position.xy=uSpawnCenter+burst;
    float spawnRadius=max(.035,diskLength(position.xy));
    vec2 radial=diskNormalize(position.xy);
    vec2 orbital=vec2(-radial.y*uAspect,radial.x/max(.001,uAspect));
    if(length(uSpawnVelocity)>.001&&dot(uSpawnVelocity,orbital)<0.0)orbital*=-1.0;
    float orbitalSpeed=sqrt((uGravity/(spawnRadius*spawnRadius+.075))*spawnRadius);
    if(uSpawnAsteroid>.5){
      velocity.xy=uSpawnVelocity+normalize(burst+vec2(.0001))*(.006+hash(seed+79.0)*.018);
    }else{
      vec2 inherited=uSpawnVelocity;
      float inheritedSpeed=length(inherited);
      if(inheritedSpeed>uSpawnVelocityScale&&inheritedSpeed>.0001)inherited*=uSpawnVelocityScale/inheritedSpeed;
      float spread=.05+hash(seed+79.0)*.16;
      velocity.xy=orbital*orbitalSpeed
        +inherited*.04
        +normalize(burst+vec2(.0001))*spread*max(.002,min(.045,uSpawnVelocityScale*.055))
        +vec2(cos(seed*371.17+uTime*.13),sin(seed*619.73+uTime*.17))*uSpawnJitter;
      float spawnSpeed=length(velocity.xy);
      float stableLimit=orbitalSpeed*(1.0+max(0.0,uSpawnVelocityScale)*.22);
      float spawnLimit=max(orbitalSpeed*1.02,min(max(uMaxSpeed,orbitalSpeed*1.12),stableLimit));
      if(spawnSpeed>spawnLimit&&spawnSpeed>.0001)velocity.xy*=spawnLimit/spawnSpeed;
    }
    position.z=uSpawnAsteroid;
    position.w=seed;
    velocity.z=1.0;
    velocity.w=seed*17.13;
  }
  if(velocity.z>.5){
    vec2 p=position.xy;
    float r=max(.025,diskLength(p));
    vec2 acceleration=-diskNormalize(p)*(uGravity/(r*r+.075));
    for(int body=0;body<8;body++){
      if(body>=uBodyCount)break;
      float orbit=mix(uPlanetRadius*2.2,uBodyRadius,float(body+1)/float(max(1,uBodyCount)));
      float phase=uTime*uBodySpeed*(.35+float(body)*.11)+float(body)*2.399;
      vec2 bp=fromDisk(dir(phase)*orbit);
      vec2 delta=bp-p;
      float d=max(.035,diskLength(delta));
      acceleration+=diskNormalize(delta)*(uBodyStrength/(d*d+.06));
    }
    if(uPointerActive>.5){
      vec2 delta=uPointer-p;
      float distance=diskLength(delta);
      if(distance<uInfluenceRadius){
        float falloff=1.0-distance/max(.001,uInfluenceRadius);
        if(uPointerMode==1)acceleration+=(uPointerVelocity*.018+diskNormalize(delta)*uInfluenceStrength*.16)*falloff;
        else if(uPointerMode==2)acceleration+=diskNormalize(delta)*uInfluenceStrength*1.8*falloff;
      }
    }
    velocity.xy+=acceleration*uDt;
    velocity.xy*=exp(-uDamping*uDt);
    float speed=length(velocity.xy);
    if(speed>uMaxSpeed)velocity.xy*=uMaxSpeed/speed;
    position.xy+=velocity.xy*uDt;
    float nextR=diskLength(position.xy);
    if(nextR<uPlanetRadius){
      velocity.xy=vec2(0.0);
      velocity.z=0.0;
    }
    if(nextR>1.35)position.xy*=-.72;
  }
  outPosition=position;
  outVelocity=velocity;
}`;
export const ORBITAL_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;uniform sampler2D uPositionState;uniform sampler2D uVelocityState;uniform ivec2 uStateSize;uniform int uParticleCapacity;uniform float uAspect;uniform float uPointSize;uniform float uStreakStrength;out float vSpeed;flat out float vSeed;flat out float vAsteroid;
void main(){int id=gl_VertexID;ivec2 cell=ivec2(id%uStateSize.x,id/uStateSize.x);vec4 p=texelFetch(uPositionState,cell,0),v=texelFetch(uVelocityState,cell,0);if(id>=uParticleCapacity||v.z<.5){gl_Position=vec4(2,2,0,1);gl_PointSize=0.0;vSpeed=0.0;vSeed=0.0;vAsteroid=0.0;return;}gl_Position=vec4(p.x/uAspect,p.y,0,1);float speed=length(v.xy);gl_PointSize=max(1.0,uPointSize*(p.z>.5?4.5:1.0)*(1.0+speed*uStreakStrength*.32));vSpeed=speed;vSeed=v.w;vAsteroid=p.z;}`;
export const ORBITAL_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;in float vSpeed;flat in float vSeed;flat in float vAsteroid;out vec4 outColor;uniform vec3 uPalette[8];uniform int uPaletteCount;uniform float uOpacity;uniform float uBrightness;float hash(float n){return fract(sin(n)*43758.5453);}void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;int index=int(floor(hash(vSeed)*float(max(1,uPaletteCount))))%max(1,uPaletteCount);vec3 color=uPalette[index];float core=exp(-d*(vAsteroid>.5?2.2:5.0));outColor=vec4(color*core*uBrightness*(1.0+min(2.0,vSpeed)*.2),smoothstep(1.0,.1,d)*uOpacity);}`;
export const ORBITAL_OVERLAY_SHADER = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform vec2 uResolution;uniform float uTime;uniform float uPlanetRadius;uniform vec3 uPlanetA;uniform vec3 uPlanetB;uniform vec3 uPlanetLight;uniform float uStars;uniform float uStarOpacity;uniform int uBodyCount;uniform float uBodyRadius;uniform float uBodySpeed;uniform float uPointerActive;uniform int uPointerMode;uniform vec2 uPointer;uniform float uPointerRadius;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);}float fbm(vec2 p){float v=0.0,a=.52;mat2 m=mat2(1.62,1.21,-1.21,1.62);for(int i=0;i<5;i++){v+=noise(p)*a;p=m*p+vec2(13.7,4.2);a*=.52;}return v;}float starLayer(vec2 uv,float scale,float threshold){vec2 warp=vec2(fbm(uv*2.9+vec2(11.7,4.2)),fbm(uv*3.4+vec2(37.1,19.8)))-.5;vec2 p=(uv+warp*.18)*uResolution*scale,cell=floor(p),local=fract(p)-.5-(vec2(hash(cell+11.7),hash(cell+41.3))-.5)*.96;float cluster=smoothstep(.28,.88,fbm(uv*5.6+vec2(2.1,9.7))),gate=smoothstep(clamp(threshold+.09-cluster*.24,.52,.995),1.0,hash(cell)),radius=mix(.035,.21,pow(hash(cell+17.31),3.4));return exp(-dot(local,local)/max(.0009,radius*radius))*gate;}vec3 stars(vec2 uv){float s=starLayer(uv+vec2(19.13,4.71),.72,.965)*.95+starLayer(uv+vec2(5.37,31.91),.42,.975)*1.35+starLayer(uv+vec2(47.1,2.9),.24,.989)*2.4;return mix(vec3(.82,.88,1),vec3(1,.92,.78),smoothstep(.22,.92,fbm(uv*15.0+4.0)))*min(s,3.0);}float circle(vec2 p,vec2 c,float r){return smoothstep(r,r-.004,length(p-c));}
void main(){float aspect=uResolution.x/max(1.0,uResolution.y);vec2 p=vec2((vUv.x-.5)*2.0*aspect,(vUv.y-.5)*2.0);vec3 color=vec3(0);float alpha=0.0;if(uStars>.5){vec3 star=stars(vUv)*uStarOpacity*2.6;color+=star;alpha=max(alpha,min(1.0,length(star)));}
float planet=circle(p,vec2(0),uPlanetRadius);if(planet>0.0){float sphere=sqrt(max(0.0,1.0-dot(p,p)/(uPlanetRadius*uPlanetRadius)));float continents=smoothstep(.42,.62,hash(floor((p+vec2(uTime*.012,0))*85.0)));vec3 surface=mix(uPlanetA,uPlanetB,continents);surface*=.32+.68*max(0.0,dot(normalize(vec3(p/uPlanetRadius,sphere)),normalize(vec3(-.4,.5,1.0))));color=mix(color,surface+uPlanetLight*pow(1.0-sphere,3.0)*.35,planet);alpha=max(alpha,planet);}
for(int body=0;body<8;body++){if(body>=uBodyCount)break;float orbit=mix(uPlanetRadius*2.2,uBodyRadius,float(body+1)/float(max(1,uBodyCount)));float phase=uTime*uBodySpeed*(.35+float(body)*.11)+float(body)*2.399;vec2 bp=vec2(cos(phase),sin(phase))*orbit;float moon=circle(p,bp,uPlanetRadius*.12);color=mix(color,mix(uPlanetLight,uPlanetB,.4),moon);alpha=max(alpha,moon);}
if(uPointerActive>.5){float ring=smoothstep(.008,.001,abs(length(p-uPointer)-uPointerRadius));vec3 ringColor=uPointerMode==2?uPlanetLight:uPlanetB;color=mix(color,ringColor,ring*.7);alpha=max(alpha,ring*.7);}outColor=vec4(color,alpha);}`;
export const ORBITAL_REALISTIC_OVERLAY_SHADER = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uEarthTexture,uMoonTexture;uniform vec2 uResolution;uniform float uTime,uPlanetRadius,uStars,uStarOpacity,uBodyRadius,uBodySpeed,uPointerActive,uPointerRadius;uniform int uBodyCount,uPointerMode;uniform vec2 uPointer;uniform vec3 uPlanetB,uPlanetLight;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),u.x),u.y);}float fbm(vec2 p){float v=0.0,a=.52;mat2 m=mat2(1.62,1.21,-1.21,1.62);for(int i=0;i<5;i++){v+=noise(p)*a;p=m*p+vec2(13.7,4.2);a*=.52;}return v;}float starLayer(vec2 uv,float scale,float threshold){vec2 warp=vec2(fbm(uv*2.9+vec2(11.7,4.2)),fbm(uv*3.4+vec2(37.1,19.8)))-.5;vec2 p=(uv+warp*.18)*uResolution*scale,cell=floor(p),local=fract(p)-.5-(vec2(hash(cell+11.7),hash(cell+41.3))-.5)*.96;float cluster=smoothstep(.28,.88,fbm(uv*5.6+vec2(2.1,9.7))),gate=smoothstep(clamp(threshold+.09-cluster*.24,.52,.995),1.0,hash(cell)),radius=mix(.035,.21,pow(hash(cell+17.31),3.4));return exp(-dot(local,local)/max(.0009,radius*radius))*gate;}vec3 stars(vec2 uv){float s=starLayer(uv+vec2(19.13,4.71),.72,.965)*.95+starLayer(uv+vec2(5.37,31.91),.42,.975)*1.35+starLayer(uv+vec2(47.1,2.9),.24,.989)*2.4;return mix(vec3(.82,.88,1),vec3(1,.92,.78),smoothstep(.22,.92,fbm(uv*15.0+4.0)))*min(s,3.0);}float circle(vec2 p,vec2 c,float r){return smoothstep(r,r-.004,length(p-c));}
void main(){float aspect=uResolution.x/max(1.0,uResolution.y);vec2 p=vec2((vUv.x-.5)*2.0*aspect,(vUv.y-.5)*2.0);vec3 color=vec3(0);float alpha=0.0;if(uStars>.5){vec3 star=stars(vUv)*uStarOpacity*2.6;color+=star;alpha=max(alpha,min(1.0,length(star)));}vec3 light=normalize(vec3(-.48,.38,.78));float radius=length(p);
if(radius<uPlanetRadius){vec2 nxy=p/uPlanetRadius;float nz=sqrt(max(0.0,1.0-dot(nxy,nxy)));vec3 n=normalize(vec3(nxy,nz));float tilt=.19,spin=uTime*.055;vec3 tilted=normalize(vec3(n.x,n.y*cos(tilt)-n.z*sin(tilt),n.y*sin(tilt)+n.z*cos(tilt)));vec3 sphere=vec3(tilted.x*cos(spin)+tilted.z*sin(spin),tilted.y,-tilted.x*sin(spin)+tilted.z*cos(spin));vec2 uv=vec2(fract(atan(sphere.z,sphere.x)/6.2831853+.5),acos(clamp(sphere.y,-1.0,1.0))/3.14159265);vec3 earth=texture(uEarthTexture,uv).rgb;float diff=max(dot(n,light),0.0),shade=mix(.055,.96,smoothstep(-.06,.54,diff)),rim=pow(1.0-nz,2.2);vec3 planet=earth*shade*(.78+smoothstep(0.0,.32,diff)*.30)+vec3(.32,.56,.92)*rim*.16;color=mix(color,planet,circle(p,vec2(0),uPlanetRadius));alpha=1.0;}else{float atmosphere=exp(-pow(max(0.0,radius-uPlanetRadius)/.032,2.0))*smoothstep(uPlanetRadius-.004,uPlanetRadius+.028,radius)*smoothstep(uPlanetRadius+.092,uPlanetRadius+.018,radius);color+=vec3(.18,.42,.95)*atmosphere*.24;alpha=max(alpha,atmosphere);}
for(int i=0;i<8;i++){if(i>=uBodyCount)break;float seed=float(i)+1.0,lane=mix(uPlanetRadius+.13,max(uPlanetRadius+.18,uBodyRadius),hash(vec2(seed,19.17))),phase=uTime*uBodySpeed*(.55+hash(vec2(seed,71.1))*.85)+float(i)*2.399963;vec2 bp=vec2(cos(phase)*aspect,sin(phase))*lane;vec2 delta=p-bp;float moonRadius=.018+hash(vec2(seed,103.3))*.016,mask=smoothstep(1.0,.92,length(delta/moonRadius));if(mask>0.0){vec2 xy=delta/moonRadius;float z=sqrt(max(0.0,1.0-dot(xy,xy)));vec3 n=normalize(vec3(xy,z));vec2 uv=vec2(fract(atan(n.z,n.x)/6.2831853+.5+uTime*.002),acos(clamp(n.y,-1.0,1.0))/3.14159265);vec3 moon=texture(uMoonTexture,uv).rgb*mix(.08,.92,smoothstep(-.08,.62,max(dot(n,light),0.0)));color=mix(color,moon,mask);alpha=max(alpha,mask);}}
if(uPointerActive>.5){float ring=smoothstep(.008,.001,abs(length(p-uPointer)-uPointerRadius));color=mix(color,uPointerMode==2?uPlanetLight:uPlanetB,ring*.7);alpha=max(alpha,ring*.7);}outColor=vec4(color,alpha);}`;
