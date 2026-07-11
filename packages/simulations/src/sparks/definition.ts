import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createSparksConfig, SPARKS_DEFAULTS, SPARKS_SETTINGS } from './config.js';
import { createSparksPlugin } from './SparksPlugin.js';
import { SPARKS_STYLE_MANIFEST } from './styles.js';

export const sparksDefinition:ExperienceDefinition={
  id:'sparks',kind:'simulation',name:'Sparks',short:'Create bright sparks that bounce off rails.',long:'Create bright sparks with welding, pinwheel, or downward shower emitters, then build rails for them to bounce from.',icon:'*',tags:['simulation','particles','sparks','welding','gpu'],paletteHint:'neon',
  capabilities:{interactive:true,reset:true,demo:true,tutorial:true,settings:true,qualityModes:['raw']},configDefaults:{...SPARKS_DEFAULTS},
  modes:[{id:'welding',label:'Welding',icon:'+',description:'Press or drag to make sparks.'},{id:'pinwheel',label:'Pinwheel',icon:'@',description:'Emit sparks in a rotating tangential pattern.'},{id:'shower',label:'Shower',icon:'|',description:'Emit downward-only sparks without inherited input velocity.'},{id:'build',label:'Build',icon:'#',description:'Tap for a short rail or drag to draw a rail.'}],
  settings:SPARKS_SETTINGS,styleManifest:SPARKS_STYLE_MANIFEST,
  tutorialPages:[{icon:'+',title:'Welding Mode',body:'Press for one burst or drag over the bench to keep the contact point active.'},{icon:'@',title:'Pinwheel Mode',body:'Switch to Pinwheel for rotating tangential spark sprays from the contact point.'},{icon:'|',title:'Shower Mode',body:'Switch to Shower for downward-only sparks that ignore pointer velocity.'},{icon:'#',title:'Build Rails',body:'Switch to Build and draw simple rails for sparks to ricochet from.'},{icon:'GPU',title:'GPU Spark Engine',body:'Spark state lives in GPU textures and renders through Basic, Enhanced, and Ultra pipelines.'}],
  physics:{renderer:'webgl2-gpu-particles',engine:'gpu-texture-particle-simulation',portability:'reusable-core',supportedShapes:['circle','box'],reusableFor:['high-count spark effects','lifespan-bounded GPU particle motion','bouncing contact fragments','welding and grinding effects'],caveats:['Contact emission is CPU-scheduled; motion, bounce bursts, trails, and rendering are GPU-resident.']},
  createPlugins:(options={})=>[createSparksPlugin(createSparksConfig(options.settings),options)],
};
