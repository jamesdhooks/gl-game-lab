import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';

export const SPARKS_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId:'white-hot',renderLayers:['particles','trails','glow','debug'],passes:['trailFeedback','edgeGlow','bloom','colorGrade'],qualities:['raw'],
  styles:[
    s('white-hot','White Hot','Blue-white welding core with gold-orange cooling fragments.',[0xffffff,0xdbeafe,0x93c5fd,0xffd166,0xf97316],0x030507),
    s('carbon-arc','Carbon Arc','Hard violet arc light with copper flecks and smoky red tails.',[0xf8fafc,0xc4b5fd,0x8b5cf6,0xf97316,0x7f1d1d],0x08050c),
    s('plasma-cyan','Plasma Cyan','Cold cyan plasma with pale green secondary shards.',[0xffffff,0xa7f3d0,0x22d3ee,0x38bdf8,0xfef3c7],0x020711),
    s('molten-gold','Molten Gold','Bright forge sparks that cool through amber and red.',[0xfffbeb,0xfde68a,0xf59e0b,0xef4444,0x7f1d1d],0x070301),
    s('magnesium-flare','Magnesium Flare','Bleached white ignition with sharp lemon-yellow hot flecks.',[0xffffff,0xfefce8,0xfef08a,0xfacc15,0xffedd5],0x050505),
    s('oxide-rain','Oxide Rain','Rust red and toxic green industrial sparks over a black bench.',[0xfef2f2,0xfb923c,0xdc2626,0xa3e635,0x22c55e],0x040604),
  ],
});
export function sparksColor3(color:number):readonly [number,number,number]{return[((color>>>16)&255)/255,((color>>>8)&255)/255,(color&255)/255]}
function s(id:string,name:string,description:string,palette:readonly number[],background:number){return Object.freeze({id,name,description,palette:Object.freeze(palette),background,passes:Object.freeze(['trailFeedback','bloom'])})}
