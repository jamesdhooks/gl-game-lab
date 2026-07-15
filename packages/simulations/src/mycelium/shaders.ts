export const MYCELIUM_SEED_SHADER = `#version 300 es
precision highp float;uniform float uSeed;uniform int uColonies;uniform float uSeedRadius;in vec2 vUv;out vec4 outColor;float hash(vec2 p){return fract(sin(dot(p+uSeed,vec2(127.1,311.7)))*43758.5453);}void main(){float alive=0.0,strain=0.0,energy=0.0;for(int i=0;i<16;i++){if(i>=uColonies)break;float phase=uSeed*.013+float(i)*2.399963,radius=i==0?0.0:.13+float(i%6)*.047;vec2 center=vec2(.5)+vec2(cos(phase),sin(phase))*radius;if(distance(vUv,center)<uSeedRadius){alive=1.0;strain=fract(float(i)*.173);energy=1.0;}}outColor=vec4(alive,strain,energy,hash(vUv*2048.0));}`;
export const MYCELIUM_STEP_SHADER = `#version 300 es
precision highp float;uniform sampler2D uFieldState;uniform vec2 uTexel;uniform vec2 uGrid;uniform float uGrowthRate;uniform float uDecayRate;uniform float uBranchChance;uniform float uOverwriteChance;uniform float uClumping;uniform float uColorMutation;uniform float uColorDriftFrequency;uniform float uBranchColorSplit;uniform float uSubstrateColorBias;uniform float uTime;uniform int uVariant;in vec2 vUv;out vec4 outColor;float hash(vec2 p){return fract(sin(dot(p+uTime,vec2(127.1,311.7)))*43758.5453);}vec4 readCell(vec2 offset){return texture(uFieldState,vUv+offset*uTexel);}void consider(vec4 n,float weight,inout float total,inout float best,inout float strain,inout float heading,inout float living){if(n.r>.5&&n.b>.105){float e=n.b*weight;total+=e;living+=1.0;if(e>best){best=e;strain=n.g;heading=n.a;}}}void main(){vec4 current=texture(uFieldState,vUv);vec2 cell=floor(vUv*uGrid);float alive=current.r,strain=current.g,energy=current.b,total=0.0,best=0.0,parentStrain=0.0,parentHeading=current.a,living=0.0;consider(readCell(vec2(-1,0)),1.0,total,best,parentStrain,parentHeading,living);consider(readCell(vec2(1,0)),1.0,total,best,parentStrain,parentHeading,living);if(uVariant==0){float up=1.0-mod(cell.x+cell.y+1.0,2.0);consider(readCell(mix(vec2(0,1),vec2(0,-1),up)),1.0,total,best,parentStrain,parentHeading,living);}else{consider(readCell(vec2(0,-1)),1.0,total,best,parentStrain,parentHeading,living);consider(readCell(vec2(0,1)),1.0,total,best,parentStrain,parentHeading,living);}if(alive>.5){energy=max(.075,energy-uDecayRate*.003);if(best>.105&&hash(cell+13.0)<uOverwriteChance*.08){strain=fract(parentStrain+(hash(cell+29.0)-.5)*uColorMutation*.2);energy=max(energy,best*.3);}}else if(best>.105){float neighborPressure=total/max(1.0,living),fertility=hash(floor(cell*.31)+parentStrain*17.0),habitat=mix(1.0,smoothstep(uClumping*.72,min(.98,uClumping*.72+.24),fertility),uClumping);float chance=clamp((.014+uGrowthRate*neighborPressure*.074)*mix(uBranchChance,1.0,.68)*habitat,0.0,.82);if(hash(cell+vec2(uTime*23.1,uTime*11.7))<chance){alive=1.0;float mutation=(hash(cell+47.0)-.5)*uColorMutation*.22*step(hash(cell+5.0),uColorDriftFrequency+uBranchColorSplit*.25);strain=fract(parentStrain+mutation+(fertility-.5)*uSubstrateColorBias*.12);energy=clamp(best*(.84+hash(cell+5.0)*.2),.26,1.35);current.a=fract(parentHeading+(hash(cell+83.0)-.5)*mix(.025,.36,uBranchChance));}}outColor=vec4(alive,strain,energy,current.a);}`;
export const MYCELIUM_SPLAT_SHADER = `#version 300 es
precision highp float;uniform sampler2D uFieldState;uniform vec2 uPoint;uniform float uRadius;uniform float uStrain;in vec2 vUv;out vec4 outColor;void main(){vec4 state=texture(uFieldState,vUv);float d=distance(vUv,uPoint),falloff=max(0.0,1.0-d*d/max(.00001,uRadius*uRadius));if(falloff>0.0){state.r=1.0;state.g=uStrain;state.b=max(state.b,.68+falloff*.42);}outColor=state;}`;
export const MYCELIUM_DISPLAY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uFieldState;
uniform vec2 uGrid;
uniform vec3 uPalette[8];
uniform vec3 uBackground;
uniform int uProceduralPalette;
uniform float uPaletteSeed;
uniform int uVariant;
uniform int uVisualStyle;
uniform float uFieldSpread;
uniform float uUltraSurfaceThreshold;
uniform float uUltraEdgeSoftness;
uniform float uUltraHaloStrength;
uniform float uUltraFiberStrength;
uniform float uUltraCoreBrightness;
uniform float uUltraRimStrength;
in vec2 vUv;
out vec4 outColor;
vec3 fixedPaletteColor(float position){
  float scaled=fract(position)*8.0;
  int i=int(floor(scaled))%8,j=(i+1)%8;
  vec3 colors[8]=vec3[8](uPalette[0],uPalette[1],uPalette[2],uPalette[3],uPalette[4],uPalette[5],uPalette[6],uPalette[7]);
  return mix(colors[i],colors[j],smoothstep(0.0,1.0,fract(scaled)));
}
vec3 hsvToRgb(vec3 hsv){
  vec3 rgb=clamp(abs(mod(hsv.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  rgb=rgb*rgb*(3.0-2.0*rgb);
  return hsv.z*mix(vec3(1.0),rgb,hsv.y);
}
vec3 myceliumColor(float position){
  if(uProceduralPalette==0)return fixedPaletteColor(position);
  float walk=fract(position),seed=fract(uPaletteSeed);
  float hue=fract(walk+seed*0.754877666);
  float saturation=0.72+0.24*(0.5+0.5*sin((walk*1.71+seed)*6.283185307));
  float value=0.76+0.22*(0.5+0.5*cos((walk*1.13-seed*0.61)*6.283185307));
  return hsvToRgb(vec3(hue,saturation,value));
}
vec4 readGrid(ivec2 cell){
  if(cell.x<0||cell.y<0||cell.x>=int(uGrid.x)||cell.y>=int(uGrid.y))return vec4(0.0);
  return texelFetch(uFieldState,cell,0);
}
void gatherNeighbors(ivec2 cell,out float living,out float edge,out float glow,out vec3 glowColor){
  living=0.0;edge=1.0;glow=0.0;glowColor=vec3(0.0);float colorWeight=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    if(x==0&&y==0)continue;
    vec4 neighbor=readGrid(cell+ivec2(x,y));float live=step(0.5,neighbor.r);
    living+=live;glow+=live*max(0.0,neighbor.b);
    glowColor+=myceliumColor(neighbor.g)*live*max(0.08,neighbor.b);
    colorWeight+=live*max(0.08,neighbor.b);
  }
  edge=1.0-smoothstep(2.0,5.0,living);
  if(colorWeight>0.0)glowColor/=colorWeight;
}
vec4 organicBloomField(vec2 uv){
  vec2 gridPos=uv*uGrid;ivec2 baseCell=ivec2(floor(gridPos));
  float density=0.0,glow=0.0,colorWeight=0.0;vec3 color=vec3(0.0);
  float spreadCoefficient=1.392/max(0.4,uFieldSpread);
  for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){
    ivec2 cell=baseCell+ivec2(x,y);vec4 state=readGrid(cell);
    float live=step(0.5,state.r);
    vec2 center=vec2(float(cell.x),float(cell.y))+vec2(0.5);
    float distanceToCell=length(gridPos-center);
    float kernel=exp(-distanceToCell*distanceToCell*spreadCoefficient);
    float energy=clamp(state.b,0.0,1.35);
    float contribution=live*kernel*(0.62+energy*0.42);
    density+=contribution;glow+=contribution*smoothstep(0.22,1.12,energy);
    color+=myceliumColor(state.g)*contribution;colorWeight+=contribution;
  }
  if(colorWeight<=0.0001)return vec4(uBackground,1.0);
  color/=colorWeight;
  float fiberNoise=sin(gridPos.x*0.41+gridPos.y*0.23+density*3.7)*0.5+0.5;
  float microNoise=sin(gridPos.x*1.73-gridPos.y*1.19+color.r*8.0)*0.5+0.5;
  float threshold=uUltraSurfaceThreshold,softness=max(0.01,uUltraEdgeSoftness);
  float contour=smoothstep(threshold-softness,threshold+softness,density+(fiberNoise-0.5)*0.08);
  float core=smoothstep(threshold+0.36,threshold+1.2,density);
  float haloStart=max(0.01,threshold-softness*3.3);
  float haloEnd=max(haloStart+0.01,threshold-softness*0.5);
  float halo=smoothstep(haloStart,haloEnd,density)*(1.0-contour);
  vec3 livingColor=mix(color*0.58,color*(1.18*uUltraCoreBrightness)+vec3(0.08,0.06,0.04),core);
  livingColor=mix(livingColor,myceliumColor(fract(colorWeight*0.09+glow*0.15)),glow*0.18*uUltraHaloStrength);
  livingColor*=0.82+fiberNoise*uUltraFiberStrength+microNoise*0.06;
  vec3 haloColor=mix(uBackground,color*(0.42+glow*0.2*uUltraHaloStrength),halo*0.72*uUltraHaloStrength);
  vec3 finalColor=mix(haloColor,livingColor,contour);
  float rim=smoothstep(threshold-softness*1.3,threshold,density)*(1.0-smoothstep(threshold+0.14,threshold+0.48,density));
  finalColor=mix(finalColor,color*1.32+vec3(0.06),rim*uUltraRimStrength);
  return vec4(finalColor,1.0);
}
void main(){
  if(uVisualStyle>=2){outColor=organicBloomField(vUv);return;}
  vec2 sampleCell=floor(vUv*uGrid);ivec2 cell=ivec2(clamp(sampleCell,vec2(0.0),uGrid-vec2(1.0)));
  vec4 state=texelFetch(uFieldState,cell,0);
  float living,edge,glow;vec3 glowColor;gatherNeighbors(cell,living,edge,glow,glowColor);
  if(state.r<0.5){outColor=vec4(uBackground,1.0);return;}
  vec3 colony=myceliumColor(state.g);float energy=clamp(state.b,0.0,1.35);
  vec2 local=fract(vUv*uGrid);
  float inner=smoothstep(0.02,0.42,min(min(local.x,1.0-local.x),min(local.y,1.0-local.y)));
  float shade=0.72+clamp(energy,0.0,1.0)*0.34;
  if(uVisualStyle>=1){
    float frontier=smoothstep(0.34,1.05,energy);
    float organic=sin(sampleCell.x*12.9898+sampleCell.y*78.233+state.g*37.719)*0.5+0.5;
    shade=0.66+inner*0.14+energy*0.26+organic*0.06;
    colony=mix(colony*(0.62+inner*0.38),colony+vec3(0.16,0.14,0.08),frontier*0.34);
    colony=mix(colony,colony*0.54,edge*0.48);
  }
  outColor=vec4(colony*shade,1.0);
}`;

export const MYCELIUM_TRIANGLE_VERTEX_SHADER = `#version 300 es
precision highp float;layout(location=0)in vec2 aClip;layout(location=1)in vec2 aCell;layout(location=2)in float aFacet;out vec2 vCell;out float vFacet;void main(){gl_Position=vec4(aClip,0,1);vCell=aCell;vFacet=aFacet;}`;

export const MYCELIUM_TRIANGLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;uniform sampler2D uFieldState;uniform vec2 uGrid;uniform vec3 uPalette[8];uniform vec3 uBackground;uniform int uProceduralPalette;uniform float uPaletteSeed;uniform int uVisualStyle;in vec2 vCell;in float vFacet;out vec4 outColor;vec3 fixedPaletteColor(float position){float scaled=fract(position)*8.0;int i=int(floor(scaled))%8,j=(i+1)%8;vec3 colors[8]=vec3[8](uPalette[0],uPalette[1],uPalette[2],uPalette[3],uPalette[4],uPalette[5],uPalette[6],uPalette[7]);return mix(colors[i],colors[j],smoothstep(0.0,1.0,fract(scaled)));}vec3 hsvToRgb(vec3 hsv){vec3 rgb=clamp(abs(mod(hsv.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);rgb=rgb*rgb*(3.0-2.0*rgb);return hsv.z*mix(vec3(1.0),rgb,hsv.y);}vec3 myceliumColor(float position){if(uProceduralPalette==0)return fixedPaletteColor(position);float walk=fract(position),seed=fract(uPaletteSeed),hue=fract(walk+seed*.754877666),saturation=.72+.24*(.5+.5*sin((walk*1.71+seed)*6.283185307)),value=.76+.22*(.5+.5*cos((walk*1.13-seed*.61)*6.283185307));return hsvToRgb(vec3(hue,saturation,value));}void main(){ivec2 cell=ivec2(clamp(floor(vCell),vec2(0),uGrid-1.0));vec4 state=texelFetch(uFieldState,cell,0);if(state.r<.5){outColor=vec4(uBackground,1);return;}vec3 colony=myceliumColor(state.g);float energy=clamp(state.b,0.0,1.35);float shade=(.76+clamp(energy,0.0,1.0)*.28)*vFacet;if(uVisualStyle>=1){float frontier=smoothstep(.34,1.05,energy),organic=sin(vCell.x*12.9898+vCell.y*78.233+state.g*37.719)*.5+.5;shade=(.68+energy*.28+organic*.07)*vFacet;colony=mix(colony,colony+vec3(.16,.14,.08),frontier*.36);}if(uVisualStyle>=2)colony+=myceliumColor(fract(state.g+.08))*smoothstep(.18,1.0,energy)*.34;outColor=vec4(colony*shade,1);}`;
