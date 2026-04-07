export type NoiseType  = 'simplex' | 'perlin' | 'worley' | 'fbm' | 'curl';
export type BlendMode  = 'add' | 'multiply' | 'screen' | 'overlay';
export type FlowType   = 'linear' | 'radial' | 'spiral' | 'vortex' | 'turbulent';

export type PaletteStop = [number, number, number];

export interface NoiseLayer {
  id:           string;
  name:         string;
  noiseType:    NoiseType;
  scale:        number;
  octaves:      number;
  speed:        number;
  direction:    [number, number];
  flowType:     FlowType;
  contrast:     number;
  brightness:   number;
  palette:      PaletteStop[];
  opacity:      number;
  blendMode:    BlendMode;
  animate:      boolean;
  warp:         number;
  curlStrength: number;
}

export interface RaeNoiseRenderer {
  addLayer:    (layer?: Partial<NoiseLayer>) => string;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<NoiseLayer>) => void;
  getLayers:   () => NoiseLayer[];
  destroy:     () => void;
  reorderLayers: (ids: string[]) => void;
}