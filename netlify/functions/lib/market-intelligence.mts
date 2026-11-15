export type ComparableSale = {
  sale_amount: number
  currency: string
  result_status: 'sold' | 'unsold' | 'withdrawn'
  sale_date: string | null
}

export type ComparableSaleSummary = {
  total_records: number
  sold_records: number
  unsold_records: number
  withdrawn_records: number
  currency_groups: Array<{
    currency: string
    count: number
    minimum: number
    median: number
    maximum: number
    sale_dates: string[]
  }>
  limitations: string[]
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Deterministic descriptive statistics over only the rights-cleared rows supplied
 * by the database query. It deliberately does not estimate the target asset's value.
 */
export function summarizeComparableSales(records: ComparableSale[]): ComparableSaleSummary {
  const sold = records.filter(record =>
    record.result_status === 'sold' &&
    Number.isFinite(record.sale_amount) &&
    record.sale_amount > 0 &&
    /^[A-Z]{3}$/.test(record.currency)
  )
  const currencies = [...new Set(sold.map(record => record.currency))].sort()
  return {
    total_records: records.length,
    sold_records: sold.length,
    unsold_records: records.filter(record => record.result_status === 'unsold').length,
    withdrawn_records: records.filter(record => record.result_status === 'withdrawn').length,
    currency_groups: currencies.map(currency => {
      const rows = sold.filter(record => record.currency === currency)
      const amounts = rows.map(record => record.sale_amount)
      return {
        currency,
        count: rows.length,
        minimum: Math.min(...amounts),
        median: median(amounts),
        maximum: Math.max(...amounts),
        sale_dates: rows.map(record => record.sale_date).filter((value): value is string => Boolean(value)).sort(),
      }
    }),
    limitations: [
      'Statistics describe only the rights-cleared, database-verified records returned for this query.',
      'Different currencies are never combined; no exchange-rate conversion is applied.',
      'A comparable sale is not automatically comparable in specification, condition, provenance, timing or sale terms.',
      'The median and range are descriptive historical observations, not an appraisal or a prediction of the target asset price.',
      'An empty dataset means no eligible records are present in this database, not that no sales exist elsewhere.',
    ],
  }
}
