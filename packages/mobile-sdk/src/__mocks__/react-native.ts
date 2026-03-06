export const Platform = {
  OS: 'ios' as 'ios' | 'android',
  Version: '17.0',
};
export const Dimensions = {
  get: (dim: 'window' | 'screen') => ({ width: 390, height: 844 }),
};
export const NativeModules = {};
