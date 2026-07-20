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

/**
 * 计算一个运单的客户应收。
 * 一个运单里不同产品的货型可能不同(如空压机商检、蚊帐普货)，所以每条按自己货型定价：
 *   应收 = Σ(客户价(该条货型) × 该条单项体积)
 * 低消保底：运单总体积不足低消时，按比例放大到低消体积(混货型比例保持)。
 * @param items 该运单下的明细(需含 货型/单箱体积/总体积)
 * @param priceOf 按货型取客户价的函数(仓库/运输方式已固定为运单的值)
 * @param minVol 低消保底体积(海0.5/陆0.3；关低消传0)
 */
export function waybillReceivable(
  items: { 货型?: string | null; 单箱体积?: number | null; 总体积?: number | null }[],
  priceOf: (cargo: string | null | undefined) => number,
  minVol: number,
): number {
  let base = 0;
  for (const it of items) base += priceOf(it.货型) * (Number(it.单箱体积) || 0);
  // 运单总体积：总体积字段是运单合计(每行重复)，取组内最大值即为合计
  let orderVol = 0;
  for (const it of items) orderVol = Math.max(orderVol, Number(it.总体积) || 0);
  if (orderVol <= 0) for (const it of items) orderVol += (Number(it.单箱体积) || 0); // 兜底用单项体积之和
  if (orderVol <= 0) return 0;
  const chargeVol = Math.max(orderVol, minVol);
  return Math.round((base * chargeVol) / orderVol * 100) / 100;
}
