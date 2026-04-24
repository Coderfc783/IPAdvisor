import YahooFinance from 'yahoo-finance2';
try {
  const yahooFinance = new (YahooFinance as any)();
  console.log('Successfully instantiated YahooFinance');
  const result = await yahooFinance.quote('AAPL');
  console.log('Successfully fetched quote for AAPL:', result.symbol);
} catch (e) {
  console.error('Failed to use YahooFinance:', e);
}
