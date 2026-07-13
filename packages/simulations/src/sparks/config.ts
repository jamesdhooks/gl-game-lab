import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';

export type SparksConfig = Readonly<Record<string, ExperienceSettingValue>>;
const EMITTER_MODES = ['welding', 'pinwheel', 'shower'];

const numeric = [
  n('emissionRate','Burst Rate','Input Mode',0,80000,25,980,EMITTER_MODES), n('contactHeat','Burst Density','Input Mode',0,12,.05,2.1,EMITTER_MODES),
  n('sparkPower','Spark Power','Input Mode',90,6000,25,480,EMITTER_MODES), n('sparkDirectionChaos','Direction Chaos','Input Mode',0,1,.01,.42,EMITTER_MODES),
  n('torchRadius','Torch Radius','Input Mode',4,56,1,24,EMITTER_MODES), n('coreSparkTorchPositionVariability','Torch Position Variability','Input Mode',0,50,1,0,['welding']),
  n('buildRadius','Build Radius','Input Mode',10,44,1,18,['build']), n('bounceRestitution','Bounce','Physics',0,1.35,.01,.58),
  n('bounceLifeDecay','Bounce Life Decay','Physics',0,1,.01,.18), n('bounceBurstChance','Bounce Burst Chance','Physics',0,1,.01,.38),
  n('bounceBurstMinSpeed','Bounce Burst Min Speed','Physics',0,6000,10,90), n('bounceBurstCount','Bounce Burst Count','Physics',0,48,1,12),
  n('bounceBurstCountSpeedScale','Bounce Count Speed Scale','Physics',0,4,.05,.8), n('bounceBurstImpactSpeedScale','Bounce Impact Speed Scale','Physics',0,4,.05,.85),
  n('bounceBurstSpread','Bounce Burst Spread','Physics',0,3,.01,1.08), n('sparkTurbulence','Turbulence','Physics',0,1,.01,.26),
  n('gravity','Gravity','Physics',80,1300,10,640), n('airDrag','Air Drag','Physics',0,4,.05,.86), n('surfaceFriction','Surface Friction','Physics',0,.85,.01,.18),
  n('coreSparkRate','Rate','Spark Profile: Core',0,18,.05,3.2), n('coreSparkSize','Size','Spark Profile: Core',.02,10,.01,1),
  n('coreSparkSizeVariability','Size Variability','Spark Profile: Core',0,2,.01,.56), n('coreSparkLifespan','Lifespan','Spark Profile: Core',0,4,.01,1),
  n('coreSparkLifespanVariability','Lifespan Variability','Spark Profile: Core',0,1,.01,.28), n('coreSparkIntensity','Intensity','Spark Profile: Core',0,8,.05,3.65),
  n('coreSparkAfterglow','Afterglow','Spark Profile: Core',0,1,.01,.38), n('primarySparkSize','Size','Spark Profile: Primary',.02,10,.01,3.6),
  n('primarySparkSizeVariability','Size Variability','Spark Profile: Primary',0,2,.01,.56), n('primarySparkLength','Length','Spark Profile: Primary',0,12,.01,1),
  n('primarySparkLengthVariability','Length Variability','Spark Profile: Primary',0,2,.01,.38), n('primarySparkLifespan','Lifespan','Spark Profile: Primary',0,4,.01,1),
  n('primarySparkLifespanVariability','Lifespan Variability','Spark Profile: Primary',0,1,.01,.34), n('primarySparkSpeedScale','Speed Scale','Spark Profile: Primary',0,3,.01,1),
  n('bounceSparkSize','Size','Spark Profile: Bounce',.02,10,.01,.42), n('bounceSparkSizeVariability','Size Variability','Spark Profile: Bounce',0,2,.01,.72),
  n('bounceSparkLength','Length','Spark Profile: Bounce',0,12,.01,.72), n('bounceSparkLengthVariability','Length Variability','Spark Profile: Bounce',0,2,.01,.52),
  n('bounceSparkLifespan','Lifespan','Spark Profile: Bounce',0,4,.01,.58), n('bounceSparkLifespanVariability','Lifespan Variability','Spark Profile: Bounce',0,1,.01,.44),
  n('bounceSparkSpeedScale','Speed Scale','Spark Profile: Bounce',0,3,.01,.72), n('bounceSparkSpeedVariability','Speed Variability','Spark Profile: Bounce',0,2,.01,0),
  n('trailFade','Trail Persistence','Rendering',.72,.992,.004,.952), n('trailContinuity','Trail Continuity','Rendering',0,2,.01,.86),
  n('bloomStrength','Bloom Strength','Rendering',.35,7.2,.05,3.85), n('heatRadius','Heat Radius','Rendering',0,130,1,72),
] as const;

export const SPARKS_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  ...numeric,
  select('simDepth','Simulation Depth','Physics','layered',[['Flat','flat'],['Layered','layered'],['Deep','deep']]),
  select('renderStyle','Render Style','Rendering','enhanced',[['Basic','basic'],['Enhanced','enhanced'],['Ultra','ultra']]),
  { ...select('rawParticleTextureSize','GPU Particle Capacity','Rendering','256',[['128² = 16k preview','128'],['256² = 65k standard','256'],['384² = 147k dense','384'],['512² = 262k heavy','512'],['768² = 590k ultra','768']]), advanced: true },
]);

const modernDefaults = Object.fromEntries(SPARKS_SETTINGS.map((setting) => [setting.key, setting.default]));
export const SPARKS_DEFAULTS: SparksConfig = Object.freeze({
  timeScale: 1,
  ...modernDefaults,
  coreFlashRate: 3.2, coreFlashSize: 1, coreFlashVariability: .56, coreIntensity: 3.65, coreAfterglow: .38,
  particleSize: 3.6, sparkLength: 1, sparkSizeVariability: .56, sparkLifespan: 1, sparkLifespanVariability: .34,
  bounceBurstSpeedScale: .72, bounceBurstLifeScale: .58,
});

export function createSparksConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): SparksConfig {
  const result: Record<string, ExperienceSettingValue> = { ...SPARKS_DEFAULTS };
  const timeScale = values.timeScale ?? SPARKS_DEFAULTS.timeScale;
  if (typeof timeScale !== 'number' || !Number.isFinite(timeScale) || timeScale < 0 || timeScale > 2) throw new Error('Sparks timeScale is outside its supported range');
  result.timeScale = timeScale;
  for (const setting of SPARKS_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max) throw new Error(`Sparks setting ${setting.key} is outside its supported range`);
    } else if (setting.type === 'select' && !setting.options.some((option) => option.value === value)) throw new Error(`Unknown Sparks ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}

export function sparksNumber(config: SparksConfig, key: string): number { const value = config[key]; if (typeof value !== 'number') throw new Error(`Sparks numeric setting is unavailable: ${key}`); return value; }
export function sparksString(config: SparksConfig, key: string): string { const value = config[key]; if (typeof value !== 'string') throw new Error(`Sparks string setting is unavailable: ${key}`); return value; }

function n(key:string,label:string,section:string,min:number,max:number,step:number,defaultValue:number,visibleModes?:readonly string[]) { return Object.freeze({key,label,section,type:'number' as const,min,max,step,default:defaultValue,...(visibleModes?{visibleModes}: {})}); }
function select(key:string,label:string,section:string,defaultValue:string,options:readonly (readonly [string,string])[]) { return Object.freeze({key,label,section,type:'select' as const,default:defaultValue,options:Object.freeze(options.map(([optionLabel,value])=>Object.freeze({label:optionLabel,value})))}); }
