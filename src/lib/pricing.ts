// 价格矩阵取价的公共逻辑，避免各处货型判断写法分叉。
// 数据里货型可能是 普货/商检/敏货，也可能是 普货/商检货/敏感货（UI 配置用的词），
// 统一按关键字匹配，别再用精确 === 判断导致"商检"掉进敏货档。

export type CargoKey = 'regular' | 'inspection' | 'sensitive';

/** 货型 → 价格档位。商检/商检货→inspection，敏货/敏感货→sensitive，其余(含普货/空)→regular */
export function cargoKey(cargo: string | null | undefined): CargoKey {
  const c = cargo || '';
  if (c.includes('商检')) return 'inspection';
  if (c.includes('敏')) return 'sensitive';
  return 'regular';
}

/** 运输方式 → sea/land。陆运→land，其余(含海运/空)→sea */
export function transportKey(transport: string | null | undefined): 'sea' | 'land' {
  return transport === '陆运' ? 'land' : 'sea';
}

/** 价格矩阵 key，如 sea_regular / land_inspection */
export function priceMatrixKey(transport: string | null | undefined, cargo: string | null | undefined): string {
  return transportKey(transport) + '_' + cargoKey(cargo);
}

/** 货型是否能被识别成某个档位。空值当普货(默认)，非空但不含普/商检/敏则无法识别，应报警而非兜底乱套价 */
export function isKnownCargo(cargo: string | null | undefined): boolean {
  const c = (cargo || '').trim();
  return c === '' || c.includes('普') || c.includes('商检') || c.includes('敏');
}

/** 运输方式是否能被识别。只认 海运/陆运，其余无法识别 */
export function isKnownTransport(transport: string | null | undefined): boolean {
  return transport === '海运' || transport === '陆运';
}
