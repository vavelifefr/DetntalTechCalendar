import fdiPermanentMap from './assets/odontogram/fdi-permanent-v1.png'

export interface ToothMapPoint {
  code: string
  centerX: number
  centerY: number
}

export interface ToothMapBounds {
  code: string
  x: number
  y: number
  width: number
  height: number
}

export const FDI_PERMANENT_MAP = {
  artwork: fdiPermanentMap,
  width: 1448,
  height: 1086,
  buttons: [
    { code: '17', centerX: 185, centerY: 279 },
    { code: '15', centerX: 367, centerY: 279 },
    { code: '13', centerX: 523, centerY: 279 },
    { code: '11', centerX: 667, centerY: 279 },
    { code: '21', centerX: 793, centerY: 279 },
    { code: '23', centerX: 944, centerY: 279 },
    { code: '25', centerX: 1080, centerY: 279 },
    { code: '27', centerX: 1261, centerY: 279 },
    { code: '18', centerX: 76, centerY: 399 },
    { code: '16', centerX: 285, centerY: 399 },
    { code: '14', centerX: 447, centerY: 399 },
    { code: '12', centerX: 590, centerY: 399 },
    { code: '22', centerX: 846, centerY: 399 },
    { code: '24', centerX: 997, centerY: 399 },
    { code: '26', centerX: 1158, centerY: 399 },
    { code: '28', centerX: 1371, centerY: 399 },
    { code: '48', centerX: 99, centerY: 571 },
    { code: '46', centerX: 291, centerY: 571 },
    { code: '44', centerX: 450, centerY: 571 },
    { code: '42', centerX: 590, centerY: 571 },
    { code: '32', centerX: 828, centerY: 571 },
    { code: '34', centerX: 996, centerY: 571 },
    { code: '36', centerX: 1161, centerY: 571 },
    { code: '38', centerX: 1349, centerY: 571 },
    { code: '47', centerX: 185, centerY: 696 },
    { code: '45', centerX: 367, centerY: 696 },
    { code: '43', centerX: 523, centerY: 696 },
    { code: '41', centerX: 667, centerY: 696 },
    { code: '31', centerX: 793, centerY: 696 },
    { code: '33', centerX: 944, centerY: 696 },
    { code: '35', centerX: 1080, centerY: 696 },
    { code: '37', centerX: 1261, centerY: 696 },
  ] satisfies readonly ToothMapPoint[],
  toothBounds: [
    { code: '18', x: 17, y: 55, width: 91, height: 148 },
    { code: '17', x: 123, y: 33, width: 91, height: 167 },
    { code: '16', x: 235, y: 33, width: 101, height: 170 },
    { code: '15', x: 346, y: 32, width: 73, height: 168 },
    { code: '14', x: 421, y: 37, width: 66, height: 164 },
    { code: '13', x: 487, y: 4, width: 77, height: 201 },
    { code: '12', x: 565, y: 31, width: 68, height: 171 },
    { code: '11', x: 635, y: 28, width: 77, height: 173 },
    { code: '21', x: 735, y: 28, width: 78, height: 174 },
    { code: '22', x: 797, y: 30, width: 82, height: 171 },
    { code: '23', x: 880, y: 29, width: 80, height: 175 },
    { code: '24', x: 962, y: 35, width: 76, height: 168 },
    { code: '25', x: 1032, y: 33, width: 70, height: 169 },
    { code: '26', x: 1117, y: 34, width: 93, height: 170 },
    { code: '27', x: 1234, y: 33, width: 91, height: 171 },
    { code: '28', x: 1340, y: 54, width: 94, height: 150 },
    { code: '48', x: 17, y: 787, width: 112, height: 181 },
    { code: '47', x: 135, y: 789, width: 105, height: 176 },
    { code: '46', x: 237, y: 790, width: 106, height: 190 },
    { code: '45', x: 355, y: 794, width: 77, height: 166 },
    { code: '44', x: 434, y: 794, width: 70, height: 166 },
    { code: '43', x: 505, y: 782, width: 78, height: 192 },
    { code: '42', x: 584, y: 779, width: 66, height: 181 },
    { code: '41', x: 654, y: 780, width: 60, height: 178 },
    { code: '31', x: 730, y: 780, width: 60, height: 179 },
    { code: '32', x: 796, y: 784, width: 65, height: 177 },
    { code: '33', x: 868, y: 787, width: 78, height: 185 },
    { code: '34', x: 942, y: 793, width: 71, height: 169 },
    { code: '35', x: 1015, y: 791, width: 81, height: 170 },
    { code: '36', x: 1093, y: 791, width: 101, height: 183 },
    { code: '37', x: 1200, y: 789, width: 101, height: 172 },
    { code: '38', x: 1318, y: 788, width: 115, height: 160 },
  ] satisfies readonly ToothMapBounds[],
} as const
