// ============================================================
// dailyQuestionBank.js
// Dedicated question bank for the daily challenge.
//
// These questions are harder than standard lesson questions.
// They test application, calculation, and cross-topic reasoning
// — not simple recall. Scenario-based where possible.
//
// PUBLIC API:
//   getDailyQuestion()
//     → { q, options[4], answer, explanation }
//     Returns the same question for every user on a given calendar
//     day. Changes at midnight. Deterministic — no randomness.
//
// SELECTION MECHANISM:
//   Digit-sum of today's ISO date string → index into DAILY_QUESTIONS.
//   "2026-03-15" → digits 2,0,2,6,0,3,1,5 → sum 19 → index 19 % n.
//   Pure function. No state. Same result on every call for a given date.
//
// QUESTION COVERAGE (60 questions):
//   Markets & Macro       — ~15 questions
//   Investing & Portfolio — ~15 questions
//   Company Analysis      — ~15 questions
//   Trading & Derivatives — ~15 questions
//
// Depends on: state.js (today())
// Load order: after state.js, before quiz.js
// ============================================================


const DAILY_QUESTIONS = [

  // ── MARKETS & MACRO ─────────────────────────────────────────

  {
    q: "The Fed raises rates by 75bp. Which of the following is most likely to happen first?",
    options: [
      "Long-term bond yields fall and tech stocks rally",
      "Short-term yields rise sharply, growth stocks compress, and the dollar strengthens",
      "Gold prices surge and consumer spending accelerates",
      "Corporate earnings immediately decline by the same magnitude"
    ],
    answer: 1,
    explanation: "A 75bp hike directly raises short-term rates and strengthens the dollar as capital seeks yield. Growth stocks — valued on distant future cash flows — compress immediately as the discount rate rises. These effects are rapid; earnings impacts lag by quarters."
  },

  {
    q: "An inverted yield curve (2-year yield > 10-year yield) most directly signals that bond markets expect:",
    options: [
      "Persistent high inflation requiring sustained rate hikes",
      "Economic weakness ahead, with the Fed eventually cutting rates",
      "A permanent structural change in long-term growth",
      "Increased government borrowing pushing long-term yields up"
    ],
    answer: 1,
    explanation: "Inversion occurs when investors rush into long-term bonds for safety, pushing their yields down below short-term rates. The 2-year yield reflects near-term rate expectations — it trades above the 10-year only when the market expects rates to fall later, which happens when recession is anticipated. This signal has preceded every US recession since the 1950s."
  },

  {
    q: "Stagflation forces the Fed into an impossible choice. If it prioritises fighting inflation by raising rates, the most direct consequence is:",
    options: [
      "Unemployment falls and growth returns faster",
      "Inflation falls but the economy slows further — potentially deepening the recession",
      "Long-term bond yields fall, stimulating investment",
      "The currency weakens, making exports cheaper"
    ],
    answer: 1,
    explanation: "In stagflation, both evils exist simultaneously. Raising rates attacks inflation by slowing spending and investment — but the economy is already stagnating. The cure for inflation (rate hikes) directly worsens the growth problem. This is why the 1970s stagflation required the painful 'Volcker shock' — a deliberately deep recession to break the inflationary spiral."
  },

  {
    q: "Real interest rates turn deeply negative (e.g. nominal 2%, inflation 6%). A rational investor's most likely response is to:",
    options: [
      "Hold more cash since rates are rising",
      "Buy long-duration government bonds for safety",
      "Move into real assets — equities, real estate, commodities — to preserve purchasing power",
      "Reduce portfolio risk since volatility is high"
    ],
    answer: 2,
    explanation: "Negative real rates mean cash and bonds lose purchasing power. The rational response is to move into assets that can appreciate in nominal terms faster than inflation — historically equities, real estate, and commodities. This is known as 'financial repression' — savers are effectively pushed into risk assets by deliberate policy. 2020-2021 demonstrated this: near-zero rates and rising inflation drove massive inflows into equities and real estate."
  },

  {
    q: "A country reports a large current account surplus alongside a strengthening currency. Which of the following best explains this combination?",
    options: [
      "The surplus means more currency is flowing in from exports than out for imports, supporting the currency's value",
      "Large trade surpluses always weaken the currency by flooding foreign markets with domestic goods",
      "The central bank is cutting rates aggressively, attracting foreign capital",
      "High inflation is the primary driver of both the surplus and the currency strength"
    ],
    answer: 0,
    explanation: "A current account surplus means the country exports more than it imports — foreign buyers must purchase the domestic currency to pay for goods, increasing demand and strengthening it. Countries like Germany, Japan, and South Korea have historically run persistent surpluses alongside relatively strong currencies for this reason. The relationship can reverse if capital flows dominate, but the trade mechanism directly supports currency strength."
  },

  {
    q: "Quantitative Easing (QE) compresses long-term yields. The mechanism through which this most directly stimulates the economy is:",
    options: [
      "Central banks printing money and distributing it directly to households",
      "Lowering borrowing costs for businesses and mortgages, while rising asset prices create a wealth effect",
      "Reducing inflation expectations by buying government bonds",
      "Increasing bank reserves, which banks immediately lend to businesses"
    ],
    answer: 1,
    explanation: "QE buys long-term bonds, pushing their prices up and yields down. Lower long-term rates reduce mortgage rates and corporate borrowing costs directly. Rising bond prices also increase the value of asset holders' portfolios, creating a 'wealth effect' that supports spending. The mechanism is indirect — reserves piling up at banks don't automatically flow as loans. Critics note QE primarily benefits those who own assets, which is why it has been associated with rising wealth inequality."
  },

  {
    q: "Copper prices surge 20% in a month while gold rises 5%. What does this combination most likely signal?",
    options: [
      "A financial crisis is imminent — both metals are safe havens",
      "Strong industrial demand and economic expansion, with modest safe-haven interest",
      "Central bank gold purchases are driving both metals higher",
      "Inflation expectations have collapsed, making real assets cheap"
    ],
    answer: 1,
    explanation: "Copper is 'Dr. Copper' — its industrial uses in construction, electronics, and manufacturing make it a real-time barometer of economic activity. A sharp copper rally signals strong industrial demand. Gold, rising modestly, shows some inflation or uncertainty hedging but not crisis-level fear (which would produce a much larger gold move). This combination is consistent with an expanding economy with moderate inflation — not a financial panic."
  },

  {
    q: "The Fed announces it will hold rates 'higher for longer.' Which asset class typically suffers most in the short term?",
    options: [
      "Short-duration government bonds",
      "High-multiple growth stocks and long-duration assets",
      "Commodities and inflation hedges",
      "Value stocks trading at low P/E ratios"
    ],
    answer: 1,
    explanation: "Long-duration assets — growth stocks and long-term bonds — are most sensitive to rate expectations because their value depends heavily on cash flows far in the future. Discounting distant profits at a higher rate for longer dramatically reduces present value. A stock trading at 40x earnings on the promise of explosive future profits is far more damaged by 'higher for longer' than a utility trading at 12x on stable current earnings."
  },

  {
    q: "A government runs a large fiscal deficit funded by issuing bonds. If the central bank does NOT monetise the debt (i.e. doesn't buy those bonds), the most likely market effect is:",
    options: [
      "Bond yields fall as more bonds are available",
      "Bond yields rise as increased supply competes for the same pool of buyers — 'crowding out' private investment",
      "The currency weakens because deficits always cause inflation",
      "Equity markets fall immediately as corporate tax rates must rise"
    ],
    answer: 1,
    explanation: "When the government issues a flood of new bonds without the central bank absorbing them, the laws of supply and demand apply: more bonds competing for the same pool of buyers means prices fall and yields rise. Higher government borrowing costs can 'crowd out' private investment by making the risk-free rate higher and tightening overall financial conditions. This was visible in 2023 when US Treasury issuance surged and long-term yields rose sharply."
  },

  {
    q: "Oil prices spike 40% due to a supply shock. Which sector combination would you expect to outperform and underperform most?",
    options: [
      "Outperform: Technology. Underperform: Energy",
      "Outperform: Energy producers and commodity firms. Underperform: Airlines, shipping, consumer discretionary",
      "Outperform: Consumer staples. Underperform: Utilities",
      "Outperform: Financials. Underperform: Healthcare"
    ],
    answer: 1,
    explanation: "An oil spike directly benefits energy producers — their revenues surge with the commodity price. Companies with high energy input costs suffer most: airlines (jet fuel is their largest operating cost), shipping companies, and consumer discretionary businesses (consumers have less to spend when filling up costs more). This supply-shock transmission is a standard macro framework — energy is an input cost that flows through the economy asymmetrically."
  },

  {
    q: "A country's central bank has been cutting rates aggressively. Which of the following is the most predictable medium-term consequence for its currency?",
    options: [
      "The currency strengthens as investors are attracted by economic growth",
      "The currency weakens as the interest rate differential versus other countries narrows or inverts, reducing capital inflows",
      "The currency is unaffected — exchange rates are determined only by trade flows",
      "The currency strengthens because lower rates reduce government debt servicing costs"
    ],
    answer: 1,
    explanation: "Currency values are heavily driven by interest rate differentials. Capital flows to where it earns the most. When a country cuts rates aggressively, its bonds yield less relative to other countries' bonds — reducing the attraction for foreign capital. Less capital inflow means less demand for that currency, weakening it. This is a core principle in FX markets — the 'carry trade' and interest rate parity are built on this relationship."
  },

  {
    q: "The yield on 10-year Treasuries rises from 3.5% to 5.0% over six months while the economy shows no signs of recession. The most likely explanation is:",
    options: [
      "The market expects the Fed to cut rates dramatically",
      "Investors are demanding more compensation for inflation risk, term premium, or increased Treasury supply",
      "The stock market has collapsed, driving flight-to-safety bond buying",
      "The Fed directly controls the 10-year yield and raised it deliberately"
    ],
    answer: 1,
    explanation: "The Fed directly controls short-term rates — it doesn't set the 10-year yield. When long-term yields rise in a healthy economy, it typically reflects rising inflation expectations (investors want more compensation for purchasing power risk), an expanding term premium (uncertainty about the distant future), or increased bond supply. This is exactly what happened in 2023 — even as the economy proved resilient, long rates rose significantly, driven by supply and inflation concerns rather than recession fear."
  },

  {
    q: "An analyst argues that the equity risk premium (ERP) has 'collapsed.' If true, what does this imply about future equity returns relative to bonds?",
    options: [
      "Equities will continue to dramatically outperform bonds",
      "Equities offer little extra compensation for the risk taken versus bonds — future outperformance is limited until valuations adjust",
      "Bonds have become riskier than equities",
      "The stock market will crash immediately"
    ],
    answer: 1,
    explanation: "The ERP is the extra return investors demand for holding equities over risk-free bonds. When it 'collapses,' stocks have been bid up so high relative to their earnings that they offer a yield barely above bonds — despite being much riskier. This doesn't guarantee an immediate crash, but it signals that future expected equity returns are low relative to the risk. Mean reversion of the ERP implies either bond yields must fall, equity prices must fall, or earnings must grow sharply to restore the premium."
  },

  {
    q: "A recession begins. The yield curve normalises from inverted to steeply upward-sloping. What caused this shift?",
    options: [
      "The government issued more long-term bonds, pushing long yields higher",
      "The Fed cut short-term rates aggressively in response to the recession, while long-term yields held or rose on eventual recovery expectations",
      "Inflation collapsed, pushing all yields down equally",
      "Foreign investors sold all Treasury bonds simultaneously"
    ],
    answer: 1,
    explanation: "When recession hits, the Fed cuts short-term rates rapidly. Short-term yields fall immediately (they track the Fed funds rate closely). Long-term yields fall less — or even rise slightly — as markets start pricing in eventual recovery and inflation. The result is re-steepening: the short end drops while the long end stays elevated. Historically, curve re-steepening after inversion often coincides with the recession itself being confirmed — the 'uninversion' is not a recovery signal."
  },

  {
    q: "Bitcoin falls 60% during a period of rising interest rates and equity market weakness. Which explanation is most consistent with what we know about crypto markets?",
    options: [
      "Crypto is entirely uncorrelated with macro and must be a company-specific event",
      "In risk-off environments, speculative assets with no cash flows are typically sold first — crypto is a high-beta risk asset despite its 'digital gold' narrative",
      "The 60% fall proves crypto is in a permanent bubble that will reach zero",
      "Rising rates directly reduce Bitcoin's mining profitability"
    ],
    answer: 1,
    explanation: "Despite the 'digital gold' narrative, Bitcoin in practice has behaved as a high-beta risk asset — rising dramatically in low-rate, risk-on environments and falling sharply when liquidity tightens and risk appetite contracts. The 2022 collapse (over 70% decline) coincided precisely with the Fed's most aggressive tightening in decades. With no earnings, dividends, or fundamental cash flows, Bitcoin's value is driven almost entirely by sentiment and liquidity conditions — making it highly sensitive to macro risk-off shifts."
  },

  // ── INVESTING & PORTFOLIO ────────────────────────────────────

  {
    q: "An investor earns 12% nominal returns in a year when inflation is 7%. Their real return is approximately 5%. However, they're in the 30% tax bracket on investment income. What is their real after-tax return?",
    options: [
      "5%",
      "8.4% — tax applies only to the nominal gain",
      "2.6% — tax is on the 12% nominal gain, leaving 8.4% post-tax, minus 7% inflation",
      "Negative — inflation exceeds after-tax returns"
    ],
    answer: 2,
    explanation: "Tax is assessed on the nominal 12% gain, not the real return. After 30% tax: 12% × 0.70 = 8.4% after-tax nominal. Subtract 7% inflation: 8.4% − 7% = 1.4% real after-tax return. (More precisely using the Fisher equation: (1.084/1.07)−1 ≈ 1.3%.) This calculation — often called the 'real after-tax return' — shows why high inflation environments are particularly punishing for investors in higher tax brackets. The government taxes the inflation component of returns as if it were real profit."
  },

  {
    q: "A portfolio has a Sharpe ratio of 0.9 and a Sortino ratio of 1.6. What does the gap between these two ratios tell you?",
    options: [
      "The portfolio is taking too much risk overall",
      "Most of the portfolio's volatility is upside volatility — downside risk is lower than total volatility implies, which is desirable",
      "The portfolio manager has made calculation errors",
      "The Sortino ratio is always higher and the gap is meaningless"
    ],
    answer: 1,
    explanation: "The Sharpe ratio divides returns by total standard deviation — treating upside and downside volatility equally. The Sortino ratio divides only by downside deviation (volatility of negative returns). When Sortino is significantly higher than Sharpe, it means most of the portfolio's volatility is upside variance — the portfolio swings up more than down. This is the desirable skew: volatile when winning, stable when losing. A large Sharpe-Sortino gap is actually a positive signal about return distribution quality."
  },

  {
    q: "You dollar-cost average $1,000/month into a fund for 12 months. The fund starts at $100/share, falls to $50 at month 6, then recovers to $100 at month 12. Compared to someone who invested $12,000 as a lump sum at the start, your outcome is:",
    options: [
      "Identical — both end at $100/share",
      "Worse — you missed more of the recovery",
      "Better — your average cost is below $100 because you bought more shares during the dip",
      "Worse — DCA always underperforms a lump sum when the price is the same at start and end"
    ],
    answer: 2,
    explanation: "The lump-sum investor bought all shares at $100 and ends at $100 — zero gain. The DCA investor bought at $100, then at $90, $80, $70, $60, $50 on the way down, then again at $60, $70, $80, $90, $100 on recovery. Their average cost per share is well below $100 — they accumulated more shares during the dip. Despite the price returning to its starting point, the DCA investor ends with a profit because their average entry price is lower than the ending price. This is DCA working exactly as designed."
  },

  {
    q: "Two funds both returned 10% over 5 years. Fund A has a beta of 1.4 and a Sharpe ratio of 0.6. Fund B has a beta of 0.8 and a Sharpe ratio of 1.1. An investor maximising risk-adjusted returns should prefer:",
    options: [
      "Fund A — same return for a higher-risk investor is always better",
      "Fund B — higher Sharpe ratio means better return per unit of total risk taken",
      "Fund A — higher beta means the manager is making more active decisions",
      "They are equivalent — same absolute return means same value"
    ],
    answer: 1,
    explanation: "Same return, but Fund B achieved it with less volatility (higher Sharpe = more return per unit of risk). Fund A needed much more market exposure (beta 1.4) and broader risk (lower Sharpe 0.6) to match Fund B's returns. On a risk-adjusted basis, Fund B is clearly superior. Fund A's investor is being compensated less per unit of risk accepted. Only if an investor specifically wanted leverage (beta > 1) might Fund A have a role — but as a standalone choice, Fund B dominates."
  },

  {
    q: "An investor holds a 60% equity / 40% bond portfolio. Equities rally 25% and bonds are flat for the year. At year-end, the portfolio is now approximately 65% equities / 35% bonds. To rebalance, the investor should:",
    options: [
      "Buy more equities — they're performing well",
      "Sell equities and buy bonds to restore 60/40 — mechanically sell what has run up, buy what has lagged",
      "Wait until bonds also rally before rebalancing",
      "Switch to a 70/30 portfolio since equities are clearly in a bull market"
    ],
    answer: 1,
    explanation: "Rebalancing forces the investor to trim the overweight position (equities, now 65%) and add to the underweight (bonds, now 35%). This mechanically implements a contrarian approach: selling some of what performed well at higher prices, and buying more of what lagged at lower prices. It restores the intended risk profile, prevents concentration drift, and historically has modest positive effects on long-term risk-adjusted returns — because it enforces 'buy low, sell high' without requiring the investor to make any directional market call."
  },

  {
    q: "An asset manager claims her fund beat the S&P 500 by 3% annually over 5 years. Before concluding she has skill (alpha), the most important question to ask is:",
    options: [
      "Was she trained at a top university?",
      "Did she take on more risk? — beta, volatility, and drawdowns must be adjusted for before attributing outperformance to skill",
      "How large is her fund?",
      "Does she hold more or fewer stocks than the index?"
    ],
    answer: 1,
    explanation: "Raw outperformance means nothing without risk adjustment. If her fund has a beta of 1.5 and the market returned 10%, her expected return before any skill is 15% — not 10%. If she 'beat' the S&P by 3%, she may have actually underperformed her risk-adjusted benchmark. The CAPM framework requires asking: what return would be expected for the amount of market exposure taken? Only excess return above that risk-adjusted expectation is true alpha attributable to skill."
  },

  {
    q: "Value stocks tend to outperform growth stocks during which specific economic conditions?",
    options: [
      "Low interest rates and technology-driven expansion",
      "Rising interest rates and economic recovery from recession, when current earnings matter more than distant future cash flows",
      "Deflation and demographic decline",
      "Peak bull markets with high consumer confidence"
    ],
    answer: 1,
    explanation: "Growth stocks are valued on distant future earnings, which shrink when discounted at higher rates. Value stocks derive most of their value from current or near-term profitability — they're less affected by discount rate changes. During economic recovery, beaten-down cyclical value companies also see sharp earnings recoveries. The 2022 value rotation is the canonical recent example: as the Fed raised rates aggressively, growth multiples compressed and value dramatically outperformed for the first time in over a decade."
  },

  {
    q: "You hold 100 shares of a stock at $80 (cost basis $60). The stock falls to $55. To optimise your tax position, you:",
    options: [
      "Hold forever — losses only matter when realised",
      "Sell to realise a capital loss, then buy back after the wash-sale window (30+ days) or buy a similar-but-not-identical security immediately",
      "Sell immediately and buy back the same stock within a week",
      "Buy more to lower your average cost basis and wait for recovery"
    ],
    answer: 1,
    explanation: "Tax-loss harvesting: sell the position to realise the $25/share loss ($55 − $80). This loss offsets gains elsewhere. However, the IRS 'wash-sale rule' prevents claiming the loss if you buy substantially identical securities within 30 days before or after selling. The solution is to wait 31+ days, or immediately buy a similar (not identical) security to maintain market exposure — e.g. sell Apple, immediately buy a tech ETF. This captures the tax benefit without sacrificing investment exposure."
  },

  {
    q: "A pension fund needs to meet fixed obligations in 15 years. Its manager uses 'liability-driven investing' (LDI) instead of maximising total returns. This approach prioritises:",
    options: [
      "Highest possible return regardless of risk",
      "Matching the duration and cash flows of assets to the known future liabilities — eliminating interest rate risk at the expense of potential upside",
      "Maximum diversification across all asset classes",
      "Short-term performance to attract more contributions"
    ],
    answer: 1,
    explanation: "LDI prioritises certainty over return. If a pension knows it owes $100M in 15 years, it can immunise that liability by holding assets (typically long-duration bonds) that pay out $100M regardless of rate changes — because the asset and liability durations are matched. A rate rise that hurts the bond price equally reduces the present value of the liability, so the fund's funded status doesn't change. This sacrifices upside but eliminates the catastrophic risk of being underfunded when the obligations come due."
  },

  {
    q: "Home country bias — overweighting domestic equities — is a documented tendency among investors worldwide. The primary risk of this behaviour is:",
    options: [
      "Paying lower taxes on domestic investments",
      "Concentration: a single country's regulatory, political, or economic shocks hit the entire portfolio with no international buffer",
      "Domestic stocks always underperform international ones",
      "Domestic investments have higher transaction costs"
    ],
    answer: 1,
    explanation: "Home country bias concentrates systemic risk. A US investor 100% in US equities was fully exposed to the 2000 dot-com bust and 2008 financial crisis. An internationally diversified investor typically had lower drawdowns. Japan's Nikkei took 34 years to recover its 1989 peak — a fully domestic Japanese investor lost three decades. International diversification is the simplest insurance against any single country's extended underperformance."
  },

  {
    q: "A company's stock has a 5-year standard deviation of returns of 25% annually, while the S&P 500's is 14%. The stock's beta is 0.6. What does this combination tell you?",
    options: [
      "The stock is lower risk than the market in every way",
      "The stock has low market correlation (low beta) but high total volatility — most of its risk is company-specific (unsystematic) rather than market-driven",
      "The stock is highly correlated with the market but amplifies moves",
      "Beta and standard deviation always move together, so this data is contradictory"
    ],
    answer: 1,
    explanation: "High volatility (25%) but low beta (0.6) means the stock moves a lot, but not in sync with the market. Most of its price movement is driven by company-specific factors — news, earnings surprises, industry dynamics — not broad market swings. This unsystematic risk can be diversified away by holding it alongside other uncorrelated assets. An investor holding this stock in a diversified portfolio faces less risk than the raw 25% volatility implies; the 0.6 beta is what matters for portfolio risk contribution."
  },

  {
    q: "Momentum investing (buying recent winners, selling recent losers) has historically generated positive returns. This is most difficult to reconcile with:",
    options: [
      "The Capital Asset Pricing Model (CAPM)",
      "The Efficient Market Hypothesis (EMH) in its semi-strong form — momentum profits suggest markets don't fully process past price information into current prices",
      "Modern Portfolio Theory",
      "The random walk hypothesis that prices follow completely unpredictable patterns"
    ],
    answer: 1,
    explanation: "The semi-strong EMH holds that all publicly available information — including past prices and returns — is already reflected in current stock prices. If true, momentum (buying based on past returns) shouldn't generate consistent excess returns. But decades of academic evidence show it does. This is one of the most robust 'anomalies' in finance, suggesting markets are slower to incorporate past price information than theory predicts — possibly due to underreaction, herding, or institutional constraints."
  },

  {
    q: "An investor is considering a 100% equity portfolio versus a 70/30 equity/bond portfolio. Over a 30-year horizon with average historical returns, the primary advantage of adding bonds is:",
    options: [
      "Significantly higher terminal wealth",
      "Lower portfolio volatility and smaller drawdowns — reducing the risk of panic-selling at a bottom, which would permanently impair wealth",
      "Higher dividend income each year",
      "Protection against inflation, which bonds always provide"
    ],
    answer: 1,
    explanation: "Purely on terminal wealth, a 100% equity portfolio historically wins over 30 years — equities have higher expected returns. The argument for bonds is behavioural and risk-management: a 40% portfolio drawdown in year 5 of a 30-year plan is tolerable on paper but devastating if the investor sells at the bottom. Bonds dampen those drawdowns. The investor who stays invested through downturns in a 70/30 portfolio often ends up wealthier than the 100% equity investor who panic-sold at the worst moment."
  },

  {
    q: "The equity risk premium (ERP) for a market can be estimated as: ERP = Earnings Yield − Risk-Free Rate. If the S&P 500 trades at 22x earnings and the 10-year Treasury yields 5%, the estimated ERP is:",
    options: [
      "22% − 5% = 17%",
      "Earnings yield is 1/22 ≈ 4.5%. ERP = 4.5% − 5% = −0.5% — equities are effectively offering less than bonds",
      "Earnings yield is 22/1 = 22%. ERP is 22% − 5% = 17%",
      "The ERP is always positive and cannot go negative"
    ],
    answer: 1,
    explanation: "Earnings yield = 1/P/E = 1/22 ≈ 4.5%. Risk-free rate = 5%. ERP = 4.5% − 5% = −0.5%. A negative ERP means equities are compensating less per unit of risk than the risk-free rate — a historically unusual and cautionary signal. The ERP turned negative briefly in the early 2000s just before the dot-com crash and attracted significant attention in 2023 when rates rose sharply. It doesn't predict an immediate crash, but suggests equities are expensive relative to bonds."
  },

  {
    q: "A financial advisor recommends annual rebalancing for a client with a 60/40 portfolio. The client asks why not daily. The best answer is:",
    options: [
      "Daily rebalancing is illegal for individual investors",
      "Transaction costs, taxes from capital gains realisation, and the bid-ask spread erode returns — frequent rebalancing has diminishing benefits and increasing frictional costs",
      "Daily rebalancing would result in a 100% stock portfolio",
      "Modern portfolios don't drift enough on a daily basis to need rebalancing"
    ],
    answer: 1,
    explanation: "Rebalancing has two costs: transaction costs (fees + bid-ask spreads) and taxes on any realised capital gains. These costs scale with frequency. The marginal benefit of rebalancing — restoring the risk profile — diminishes rapidly as frequency increases. Research shows that quarterly to annual rebalancing captures nearly all the structural benefit. Daily rebalancing costs significantly more in tax and transaction drag than the marginal allocation improvement provides. Threshold-based rebalancing (rebalance only when drift exceeds 5%) is often more efficient than pure calendar-based approaches."
  },

  // ── COMPANY ANALYSIS ────────────────────────────────────────

  {
    q: "Company A has revenue of $500M, COGS of $200M, and operating expenses of $180M. What is its operating margin?",
    options: [
      "(500 − 200) / 500 = 60%",
      "(500 − 200 − 180) / 500 = 24%",
      "180 / 500 = 36%",
      "200 / 500 = 40%"
    ],
    answer: 1,
    explanation: "Operating income = Revenue − COGS − Operating Expenses = $500M − $200M − $180M = $120M. Operating margin = $120M / $500M = 24%. Common mistake: using only COGS in the numerator gives gross margin (60%), not operating margin. Operating margin includes both production costs (COGS) and overhead (operating expenses like R&D, sales, and admin) before interest and taxes."
  },

  {
    q: "A company's EPS grows 15% but its stock falls 8% on earnings day. The most likely explanation is:",
    options: [
      "The company committed accounting fraud",
      "The market had priced in even higher growth — 15% came in below consensus expectations, causing a 'sell the news' reaction",
      "15% EPS growth always causes stock price declines",
      "The dividend was cut, overriding the strong earnings"
    ],
    answer: 1,
    explanation: "Stock prices are driven by surprises versus expectations, not absolute results. If analysts had consensus forecasts of 20% EPS growth and the company delivered 15%, the 15% is technically a miss — below expectations. Markets immediately reprice to reflect the lower-than-expected reality. This 'sell the news' phenomenon is especially pronounced for high-multiple growth stocks where most of the value is in optimistic future projections. Strong absolute growth numbers can still cause declines if the bar was set even higher."
  },

  {
    q: "Company A trades at EV/EBITDA of 14x. Company B in the same sector trades at 9x. Before concluding that Company B is 'cheaper,' the most important factor to investigate is:",
    options: [
      "Which company has the higher share price",
      "Whether the EBITDA quality and growth rates differ — a high-growth, high-margin company deserves a premium multiple vs a low-growth, declining one",
      "The CEO's track record at previous companies",
      "Whether both companies pay dividends"
    ],
    answer: 1,
    explanation: "Multiple compression or expansion is driven by growth, quality, and returns on capital — not just current earnings. Company A may trade at 14x because it grows EBITDA 20% annually with high margins. Company B at 9x may have declining EBITDA, low margins, or high capex needs. 'Cheapness' on a multiple is only meaningful relative to the quality and trajectory of the underlying cash flows. A 9x multiple on deteriorating EBITDA is often genuinely expensive. This is the most common mistake in simplistic multiple-based valuation."
  },

  {
    q: "A DCF model produces a valuation of $85/share. The current stock price is $90. A sensitivity table shows that the valuation swings from $60 to $115 depending on the terminal growth rate assumption. What conclusion should an analyst draw?",
    options: [
      "The stock is clearly overvalued by $5 and should be shorted",
      "The model is broken and should be discarded",
      "The valuation is highly sensitive to assumptions — the analyst should focus on the base case reasonableness and not treat the $85 as a precise answer",
      "Terminal growth rate assumptions are irrelevant to the conclusion"
    ],
    answer: 2,
    explanation: "A $55 swing in value ($60–$115) from a single assumption is a warning about precision — not an invitation to pick any number. Terminal value in DCFs typically represents 60–80% of total enterprise value, making it the most critical and most uncertain input. Professional analysts treat DCF as a framework for testing sensitivities and logic, not as a machine producing precise answers. The current price of $90 is within the range — the model doesn't clearly say it's under or overvalued. This humility is essential; DCF models are storytelling tools as much as calculation tools."
  },

  {
    q: "A company has negative free cash flow despite positive net income of $50M. Which of the following scenarios is most consistent with this situation?",
    options: [
      "The company is committing accounting fraud",
      "The company is investing heavily in capital expenditure or working capital — actual cash outflows exceed earnings, often a sign of high growth investment",
      "Net income is calculated incorrectly and should always equal free cash flow",
      "The company is paying excessive dividends funded by borrowing"
    ],
    answer: 1,
    explanation: "Net income and free cash flow diverge for legitimate reasons. A company growing rapidly may invest $100M in capex (building factories, infrastructure) while earning $50M — yielding negative FCF despite positive earnings. Working capital buildup (building inventory, extending credit) also consumes cash that doesn't show up as an expense. This is normal for high-growth businesses and not inherently alarming. Amazon ran negative FCF for years while building warehouses and cloud infrastructure — the capex was investment, not failure."
  },

  {
    q: "An investment banker presents three valuation methodologies for an acquisition target: DCF ($280M), comparable companies ($340M), and precedent transactions ($410M). Which value should the acquirer use as their offer price?",
    options: [
      "The DCF — it's the most rigorous intrinsic value method",
      "The precedent transactions — sellers always expect to receive what others received",
      "The range informs the negotiation: precedent transactions set the ceiling, DCF provides the intrinsic floor, and comps benchmark current market conditions",
      "Average the three: ($280+$340+$410)/3 ≈ $343M"
    ],
    answer: 2,
    explanation: "The three methodologies answer different questions and should be used as a triangulated range. Precedent transactions include control premiums (typically 20–40%) paid in actual deals — they represent what acquirers have historically been willing to pay, setting the market ceiling for negotiations. Comps reflect current market pricing. DCF reflects intrinsic value under specific assumptions. A 'football field' chart showing all three ranges helps buyers and sellers understand where their negotiation sits relative to market precedent. Simply averaging ignores what each method actually measures."
  },

  {
    q: "Company WACC is 10%. A proposed investment project has an expected IRR of 8%. Should management proceed?",
    options: [
      "Yes — 8% return is still positive",
      "No — the project returns less than the cost of capital (10%), destroying shareholder value by generating less than investors require",
      "Yes — IRR above zero always creates value",
      "It depends entirely on the project's revenue"
    ],
    answer: 1,
    explanation: "WACC is the minimum return a project must generate to create value — it's the hurdle rate. Investors (equity and debt holders) require 10% return on capital. A project returning only 8% destroys value: the company is deploying $1 of investor capital and returning less than what investors could have earned elsewhere for the same risk. The NPV of this project (discounting at 10%) would be negative. This principle — invest only where expected returns exceed the cost of capital — is the foundation of corporate capital allocation."
  },

  {
    q: "A company's gross margin is 65% but its operating margin is only 8%. What does this pattern typically indicate?",
    options: [
      "The company has extremely high debt and interest payments",
      "The company has a strong core product (high gross margin) but very heavy operating overhead — large sales, R&D, or admin spend is consuming most of the gross profit",
      "COGS is understated due to accounting errors",
      "The company is in a capital-intensive industry like mining or utilities"
    ],
    answer: 1,
    explanation: "The gross-to-operating margin gap (65% − 8% = 57% of revenue consumed by opex) tells you the product itself is highly profitable at the unit level, but the company is spending heavily to operate. This is a classic profile of high-growth technology companies: software has near-zero marginal cost (high gross margin), but massive sales teams, R&D spend, and G&A create a large overhead burden. The question becomes whether these opex investments are building durable competitive advantage that will eventually convert into operating leverage — or whether the model is structurally unprofitable."
  },

  {
    q: "A leveraged buyout firm acquires a company at 9x EV/EBITDA using 65% debt financing. To generate a target IRR of 22%, which lever is most powerful when exiting in 5 years?",
    options: [
      "Reducing the multiple paid at entry",
      "Multiple expansion — exiting at a higher EV/EBITDA than the entry multiple is the single largest driver of LBO returns",
      "Maximising debt repayment using the company's cash flows",
      "Cutting headcount immediately after acquisition to boost EBITDA"
    ],
    answer: 1,
    explanation: "LBO returns are typically driven by three factors: EBITDA growth, multiple expansion, and debt paydown (deleveraging). In the low-rate era, multiple expansion was often the dominant driver — buy at 9x, grow the business, improve the story, exit at 12x. A 3-turn expansion on a $100M EBITDA company adds $300M to enterprise value. This is why exit market conditions matter enormously in PE — even well-managed businesses can disappoint if multiples have compressed by exit time, as experienced in the 2022-23 rate environment."
  },

  {
    q: "Enterprise Value (EV) = $500M. Net debt = $100M. The company earned $30M in net income. What is the P/E ratio, and why might an analyst prefer EV/EBITDA over P/E for comparing this company to peers?",
    options: [
      "P/E = 500/30 ≈ 16.7x. EV/EBITDA is worse because it ignores interest and taxes",
      "Market Cap = EV − Net Debt = $400M. P/E = 400/30 ≈ 13.3x. EV/EBITDA is preferred because it is capital-structure neutral — it compares operating performance without distortion from different debt levels",
      "P/E = 400/30 ≈ 13.3x. EV/EBITDA is preferred because it always produces a lower number",
      "P/E and EV/EBITDA always produce the same result for comparable companies"
    ],
    answer: 1,
    explanation: "Market cap = EV − net debt = $500M − $100M = $400M. P/E = $400M / $30M ≈ 13.3x. EV/EBITDA is capital-structure neutral: it compares enterprise value to pre-interest, pre-tax earnings. Two identical businesses — one financed entirely with equity, one with 80% debt — will have identical EV/EBITDA multiples but very different P/E ratios (because the levered company has higher interest costs, lower net income, and higher P/E on the same underlying business). This distortion makes P/E a poor comparison tool when companies have meaningfully different capital structures."
  },

  {
    q: "A company's return on equity (ROE) is 25% while its return on assets (ROA) is 8%. What does this spread tell you?",
    options: [
      "The company is generating 25% on equity because it is highly profitable at the asset level",
      "The company is using significant financial leverage — debt amplifies the return on equity shareholders receive above what the underlying assets generate",
      "ROE is always higher than ROA and the gap is irrelevant",
      "The company's assets are undervalued on the balance sheet"
    ],
    answer: 1,
    explanation: "ROE − ROA gap is a direct measure of leverage's effect. If assets earn 8% but equity earns 25%, debt is amplifying returns to equity holders. The DuPont decomposition makes this explicit: ROE = ROA × (Assets/Equity). If assets/equity = 3.1x (roughly 68% debt), then ROE = 8% × 3.1 ≈ 25%. High ROE from leverage looks attractive but masks the underlying asset profitability and amplifies both upside and downside. Buffett looks for high ROE driven by margin and asset turnover — not leverage."
  },

  {
    q: "A company announces a stock split (3-for-1). A shareholder with 100 shares at $300 will have:",
    options: [
      "300 shares at $100, and is worth 3x more",
      "300 shares at $100, with total value unchanged at $30,000",
      "33 shares at $900, worth the same",
      "100 shares at $100, and lost $20,000 in value"
    ],
    answer: 1,
    explanation: "A stock split is purely cosmetic — it increases share count and proportionally decreases price. The economic value of the position is identical: 100 shares × $300 = $30,000 before; 300 shares × $100 = $30,000 after. Splits make no change to a company's total market cap, earnings, or fundamental value. Companies split primarily to lower the nominal share price and improve accessibility for smaller investors. Splits are sometimes misinterpreted as bullish signals, but the split itself creates no value."
  },

  {
    q: "In a leveraged buyout, the 'cash-on-cash return' after 5 years is 3.0x. The IRR is 24.6%. These two figures are consistent because:",
    options: [
      "They measure completely different things and are unrelated",
      "A 3.0x multiple over 5 years equals approximately 24.6% annualised — the IRR is the annualised rate that turns $1 invested into $3 over 5 years",
      "3.0x return over 5 years always equals 24.6% regardless of time",
      "Cash-on-cash returns are always 3x the IRR"
    ],
    answer: 1,
    explanation: "The relationship: $1 × (1 + r)^5 = $3.0, so (1+r)^5 = 3.0. Taking the 5th root: 1+r = 3.0^(1/5) ≈ 1.246. IRR ≈ 24.6%. MOIC (multiple of invested capital) and IRR are both used in private equity to measure returns — MOIC shows total return ignoring time, IRR accounts for time value. A 3.0x in 3 years is much better than 3.0x in 10 years; IRR captures this distinction. PE firms track both because they measure different dimensions of performance."
  },

  // ── TRADING & DERIVATIVES ────────────────────────────────────

  {
    q: "You buy a call option with a $50 strike for $4. At expiration, the stock is at $47. Your total P&L is:",
    options: [
      "+$3 (stock is close to the strike)",
      "−$4 (the entire premium is lost — the option expires worthless)",
      "+$4 (you profited from time decay)",
      "−$7 (you lose the difference between stock price and strike, plus the premium)"
    ],
    answer: 1,
    explanation: "At expiration, a call option is only worth something if the stock is above the strike price (in the money). With the stock at $47 and the strike at $50, the call is $3 out of the money — there's no value in the right to buy at $50 when the market price is $47. The option expires worthless, and you lose your entire $4 premium. The maximum loss for an option buyer is always the premium paid. This is a core property that differentiates options from stock ownership — defined, capped downside."
  },

  {
    q: "An options market maker quotes a call with implied volatility (IV) of 35%. If they expect realised volatility to be only 22%, their ideal strategy is:",
    options: [
      "Buy the call, anticipating the stock will move more than expected",
      "Sell the call and dynamically delta-hedge — if realised vol is lower than IV, they profit from the difference (known as 'short vol' or 'selling premium')",
      "Buy the stock outright — options have no advantage here",
      "Sell the call and hold no hedge, maximising the premium received"
    ],
    answer: 1,
    explanation: "When IV (what the market is pricing in) exceeds expected realised volatility (what you expect to happen), options are expensive relative to their likely outcome. The edge is to sell the overpriced volatility and delta-hedge to remove directional risk, profiting purely from the IV−RV spread. This 'short gamma, short vega' strategy profits as the inflated premium decays and IV reverts to realised vol. This is the fundamental business of professional options market makers and sophisticated volatility traders — selling expensive insurance."
  },

  {
    q: "You own 1,000 shares of a stock at $80. You buy 10 put contracts ($80 strike, $3 premium, 3 months to expiry). The stock falls to $60. Your total portfolio P&L is:",
    options: [
      "−$20,000 (just the stock loss)",
      "−$3,000 (just the put premium paid)",
      "−$3,000 net — stock loss of $20,000 fully offset by $20,000 put gain, minus $3,000 premium",
      "+$17,000 profit from the puts alone"
    ],
    answer: 2,
    explanation: "Stock loss: 1,000 shares × ($60 − $80) = −$20,000. Put gain: the right to sell at $80 when stock is $60 = $20 intrinsic value per share × 100 shares per contract × 10 contracts = $20,000 gain. Premium cost: 10 contracts × 100 × $3 = −$3,000. Net P&L: −$20,000 + $20,000 − $3,000 = −$3,000. The puts provided perfect downside protection for the cost of the insurance premium. This is protective put strategy — portfolio insurance. The worst you can lose is the premium ($3,000) regardless of how far the stock falls."
  },

  {
    q: "A call option has a delta of 0.55 and a gamma of 0.06. If the stock rises $2, the option price increases by approximately $1.10, and the new delta is approximately:",
    options: [
      "0.55 (delta doesn't change with price)",
      "0.55 + (0.06 × 2) = 0.67",
      "0.55 − 0.06 = 0.49",
      "0.06 × 2 = 0.12"
    ],
    answer: 1,
    explanation: "Gamma is the rate of change of delta. For each $1 move in the underlying, delta changes by gamma. A $2 move adds 2 × 0.06 = 0.12 to delta. New delta ≈ 0.55 + 0.12 = 0.67. The option now moves more in line with the stock than it did before the move (because it's now deeper in the money). This is why gamma is crucial for dynamic hedging — delta-hedged positions must be re-hedged as the underlying moves, and gamma tells you how quickly you need to rebalance."
  },

  {
    q: "You short 500 shares of a stock at $40. Two months later it trades at $65. You close the position. Your P&L is:",
    options: [
      "+$12,500 (the stock went up so you profit)",
      "−$12,500 (you shorted — the stock moving against you costs $25 per share × 500)",
      "+$25,000 (shorts pay out when stocks fall)",
      "−$32,500 (you lose the full value of the shares)"
    ],
    answer: 1,
    explanation: "Short P&L = (entry price − exit price) × shares = ($40 − $65) × 500 = −$25 × 500 = −$12,500. Shorts profit when price falls (entry > exit) and lose when price rises (entry < exit). You borrowed the stock, sold it at $40, and must now buy it back at $65 to return it. The $25/share rise is a pure loss. This illustrates the asymmetric risk of short selling: maximum profit is 100% (stock goes to zero), while losses are theoretically unlimited (stock can rise infinitely)."
  },

  {
    q: "Implied volatility (IV) spikes from 20% to 45% the day before a company's earnings announcement. This happens because:",
    options: [
      "The stock's historical volatility has risen sharply",
      "Option sellers demand much higher premiums to compensate for the known uncertainty of the earnings event — the market is pricing in a large potential move",
      "The company's debt level has suddenly increased",
      "Retail investors are irrationally buying options"
    ],
    answer: 1,
    explanation: "IV reflects the market's expectation of future volatility — what option sellers charge as insurance. Before earnings, nobody knows whether results will beat, meet, or miss expectations. This uncertainty is large, discrete, and imminent — the option seller faces a known risk event. They demand higher premiums to compensate, which mathematically implies higher IV. Post-announcement, the uncertainty resolves and IV 'crushes' back to normal — this is the 'vol crush' that traps option buyers who bought expensive pre-earnings options and held through the announcement."
  },

  {
    q: "A long straddle involves buying both a call and put at the same strike. A trader profits from a long straddle when:",
    options: [
      "The stock price stays exactly at the strike price",
      "The stock makes a large move in either direction — the magnitude of the move exceeds the combined premium paid for both options",
      "Implied volatility falls significantly after purchase",
      "The underlying stock pays a dividend"
    ],
    answer: 1,
    explanation: "A straddle profits from volatility, not direction. The combined premium (call + put) represents the breakeven move needed in either direction. If you pay $8 for a straddle at a $100 strike, you need the stock to be above $108 or below $92 at expiration to profit. The worst outcome is a stock that stays flat — both options expire worthless and you lose the full premium. Traders buy straddles before expected volatile events (earnings, FDA decisions) when they expect a big move but don't know which direction."
  },

  {
    q: "A stock at $100 has a 30-day ATM option with IV of 40%. Using the rough approximation 'expected move = (IV / √12)', the market implies approximately:",
    options: [
      "±40% move over the next month",
      "±11.5% move over the next month — IV/√12 ≈ 40%/3.46 ≈ 11.5%",
      "±40% move per day for 30 days",
      "±3.3% move over the next year"
    ],
    answer: 1,
    explanation: "Annual IV must be scaled to the relevant time period. Since IV is quoted as annual volatility and there are ~12 months in a year, monthly expected move ≈ IV / √12. 40% / √12 ≈ 40% / 3.46 ≈ 11.5%. This means the market is pricing roughly a ±$11.50 move on a $100 stock over the next month — encompassing 1 standard deviation. Option prices around earnings reflect this expected move, which is why ATM straddle prices give you a direct read on the market's implied earnings-move expectation."
  },

  {
    q: "A trader sells 10 naked put contracts ($50 strike, $2.50 premium, 45 days to expiry). The stock falls to $35 at expiration. Total P&L is:",
    options: [
      "+$2,500 (full premium collected)",
      "−$12,500 — required to buy 1,000 shares at $50 when worth $35, offset by $2,500 premium: net loss $12,500",
      "−$15,000 (full intrinsic value loss with no offset)",
      "+$12,500 (the put premium was deeply in the money)"
    ],
    answer: 1,
    explanation: "As the put seller, you are obligated to buy 1,000 shares (10 contracts × 100) at $50 when the market price is $35. Loss per share: $50 − $35 = $15. Total loss: $15 × 1,000 = $15,000. Offset by premium received: $2.50 × 1,000 = $2,500. Net P&L: −$15,000 + $2,500 = −$12,500. This illustrates the naked put seller's risk profile: the premium collected is capped, but the downside loss is nearly unlimited (stock can fall to zero). This is why naked puts require significant margin and are unsuitable for most retail investors."
  },

  {
    q: "A company using 2:1 margin (50% margin requirement) to buy $200,000 of stock controls a $200,000 position with $100,000 of their own capital. The stock falls 20% to $160,000. Their equity in the account is now:",
    options: [
      "$100,000 — margin protects the full equity",
      "$60,000 — equity falls by the full $40,000 loss despite only controlling half the position",
      "$80,000 — losses are split proportionally between equity and margin loan",
      "$0 — a 20% fall triggers automatic liquidation"
    ],
    answer: 1,
    explanation: "Equity = Position Value − Margin Loan. Loan was $100,000 (the borrowed half). After a 20% loss: position value = $160,000. Equity = $160,000 − $100,000 loan = $60,000. The full $40,000 loss comes out of the investor's $100,000 equity — a 40% loss on equity from a 20% move in the underlying. This is leverage amplifying losses: 2x leverage means 2x the percentage loss (and gain). If the stock fell ~38% ($200k × 0.62 = $124k = $100k loan + ~$24k equity), a margin call would be triggered as maintenance margin requirements kick in."
  },

  {
    q: "A risk manager calculates a 1-day 99% Value at Risk (VaR) of $2 million for a trading book. This means:",
    options: [
      "The portfolio will definitely lose $2M tomorrow",
      "There is a 1% chance of losing more than $2M in a single day based on the model's assumptions",
      "The maximum possible loss is $2M",
      "The portfolio will lose $2M exactly 99% of trading days"
    ],
    answer: 1,
    explanation: "VaR states: 'with X% confidence, we will not lose more than Y over time period Z.' A 99% 1-day VaR of $2M means the model estimates a 1% daily probability (roughly 2-3 trading days per year) of losing more than $2M. It says nothing about the magnitude of losses beyond that threshold — losses on those 1% of days could be $3M, $10M, or far more. This is VaR's critical limitation: it's a threshold measure, not a worst-case measure. The 2008 financial crisis featured multiple 'once in a century' VaR breaches in a single week."
  },

  {
    q: "A stock has a 3-month at-the-money call option. Everything else equal, which single change would most increase the option's price?",
    options: [
      "The risk-free interest rate falling from 5% to 4%",
      "Implied volatility rising from 25% to 40%",
      "The company announcing it will not pay a dividend",
      "The option's expiry being moved from 3 months to 2 months from today"
    ],
    answer: 1,
    explanation: "Volatility (vega) is the dominant driver of option prices, especially for ATM options. A 15-percentage-point IV increase (25% → 40%) typically dwarfs other inputs in impact. Moving from 3 to 2 months reduces time value (theta effect) but an ATM option has positive vega — rising IV adds far more value than losing a month subtracts. Rate changes have a smaller effect (rho). Dividend adjustments matter but are secondary to IV. For ATM options, vega is the single most powerful sensitivity, which is why vol spikes drive option premiums far more than underlying price moves on news days."
  },

  {
    q: "A trader enters a 'bull call spread' by buying a $45 call for $6 and selling a $55 call for $2. Maximum profit and maximum loss are:",
    options: [
      "Max profit: unlimited. Max loss: $4 (net premium paid)",
      "Max profit: $6 ($10 spread − $4 net premium). Max loss: $4 (net premium paid)",
      "Max profit: $10 (full spread width). Max loss: $6 (full long call premium)",
      "Max profit: $4 (net premium). Max loss: $10 (full spread width)"
    ],
    answer: 1,
    explanation: "Net premium paid: $6 − $2 = $4 (your maximum loss if both options expire worthless below $45). Maximum profit: spread width − net premium = ($55 − $45) − $4 = $6 per share ($600 per contract). This occurs when the stock is at or above $55 at expiration. The bull call spread caps both profit and loss, making it a defined-risk, defined-reward structure. It's cheaper than a straight long call (selling the $55 call recovers $2 of the premium) at the cost of capping upside at $55 — suitable for moderately bullish outlooks."
  },

  {
    q: "Stop-loss orders are designed to limit losses. In a 'flash crash' (market drops 10% in seconds then recovers), a stop-loss order at −5% will most likely:",
    options: [
      "Execute exactly at −5% from the entry price",
      "Execute as a market order during the crash — potentially at far below −5% due to the complete absence of buyers — a significant gap below the intended level",
      "Not execute — flash crashes trigger circuit breakers that protect all orders",
      "Execute at the day's closing price regardless of the intraday level"
    ],
    answer: 1,
    explanation: "A stop-loss converts to a market order when triggered. In a flash crash, liquidity evaporates — there may be no buyers at any reasonable price for seconds. Your market order executes at whatever the next available bid is: potentially 10%, 15%, or more below your stop price. This 'slippage' or 'gapping' is the fundamental limitation of stop-loss orders in low-liquidity environments. They provide excellent protection in orderly markets but fail precisely when you most need them — during disorderly dislocations. Stop-limit orders address part of this (they won't execute below the limit) but may result in no execution at all."
  },

  {
    q: "A fund reports 'delta-one' exposure to equities. In options terminology, this means:",
    options: [
      "The fund holds only options with delta of 1.0 (deep in-the-money calls)",
      "The fund has direct, unlevered equity exposure with no optionality — every $1 move in the market produces a $1 move in the portfolio's value (per dollar invested)",
      "The fund's positions have zero sensitivity to market movements",
      "Delta-one refers specifically to Treasury bonds with one year to maturity"
    ],
    answer: 1,
    explanation: "Delta-one describes any instrument that tracks an underlying asset directly, dollar-for-dollar, with no optionality. ETFs, index futures, swaps, and long stock are delta-one instruments — they move exactly with the underlying. This contrasts with options, which have delta between 0 and 1 (or −1 to 0 for puts) and provide non-linear payoffs. Delta-one trading desks at banks focus on products like ETFs, synthetic swaps, and structured products that replicate direct market exposure. The term 'one' refers to the delta: a 1% rise in the market produces a 1% change in the delta-one position."
  }

];

DAILY_QUESTIONS.forEach((question, index) => {
  if (typeof ensureQuestionMetadata === 'function') {
    ensureQuestionMetadata(question, {
      lessonId: 'daily',
      lessonTitle: 'Daily Challenge',
      unit: 'Daily Challenge',
      tier: 'platinum',
      index,
      topicId: question.topicId || question.topic || 'daily-challenge'
    });
  }

  if (!question.difficulty) {
    question.difficulty = 'hard';
  }
});


// ── DAILY QUESTION SELECTOR ──────────────────────────────────
// Returns the same question for all users on a given calendar day.
//
// Method: sum the digits of today's ISO date string.
//   "2026-03-15" → digits [2,0,2,6,0,3,1,5] → sum = 19
//   19 % 60 = index 19
//
// Properties:
//   - Deterministic: same date → same result on every call
//   - Changes at midnight: today() returns a new string
//   - Universal: all users share the same today() function
//   - No randomness, no server needed

function getDailyQuestionSeed(dateString = today()) {
  const digitSum   = dateString
    .replace(/-/g, '')           // "20260315"
    .split('')
    .reduce((sum, ch) => sum + parseInt(ch, 10), 0);
  return digitSum;
}

function getDailyQuestionIndex(dateString = today()) {
  return getDailyQuestionSeed(dateString) % DAILY_QUESTIONS.length;
}

function getDailyQuestionNumber(dateString = today()) {
  const start = new Date('2025-01-01T00:00:00');
  const current = new Date(`${dateString}T00:00:00`);
  const diff = Math.floor((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function _dailySeededShuffle(list, seed) {
  const copy = Array.isArray(list) ? [...list] : [];
  let state = Math.max(1, Math.floor(Math.abs(Number(seed) || 1))) % 2147483647;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function _collectDailyExtraDistractors(baseIndex) {
  const base = DAILY_QUESTIONS[baseIndex];
  const baseOptions = new Set((base?.options || []).map(option => String(option).trim()));
  const near = [];
  for (let offset = 1; offset <= 10; offset += 1) {
    near.push((baseIndex + offset) % DAILY_QUESTIONS.length);
    near.push((baseIndex - offset + DAILY_QUESTIONS.length) % DAILY_QUESTIONS.length);
  }
  const pull = indexes => indexes.flatMap(index => (DAILY_QUESTIONS[index]?.options || []));
  const extras = pull(near).concat(
    DAILY_QUESTIONS.flatMap((question, index) => index === baseIndex ? [] : (question.options || []))
  );
  return [...new Set(extras.map(option => String(option).trim()))]
    .filter(option => option && !baseOptions.has(option));
}

function _extractDailyHintKeywords(text) {
  const STOP = new Set([
    'the', 'and', 'with', 'that', 'from', 'into', 'your', 'than', 'this', 'will',
    'have', 'more', 'most', 'they', 'them', 'their', 'would', 'while', 'after',
    'which', 'when', 'then', 'only', 'does', 'because', 'about', 'above', 'below',
    'higher', 'lower', 'should', 'under', 'over', 'across', 'being', 'through',
    'same', 'much', 'very', 'just', 'even', 'what', 'why', 'rate', 'rates'
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOP.has(word))
    .slice(0, 3);
}

function buildDailyQuestionRound(dateString = today()) {
  const index = getDailyQuestionIndex(dateString);
  const base = DAILY_QUESTIONS[index];
  if (!base) return null;

  const originalCorrect = base.options[base.answer];
  const originalWrongs = base.options.filter((_, optionIndex) => optionIndex !== base.answer);
  const desiredOptionCount = 7;
  const extraDistractors = _dailySeededShuffle(
    _collectDailyExtraDistractors(index),
    getDailyQuestionSeed(dateString) + (index + 1) * 17
  ).slice(0, Math.max(0, desiredOptionCount - (1 + originalWrongs.length)));

  const optionPool = [originalCorrect, ...originalWrongs, ...extraDistractors];
  const shuffledOptions = _dailySeededShuffle(optionPool, getDailyQuestionSeed(dateString) + 97);
  const answerIndex = shuffledOptions.findIndex(option => option === originalCorrect);
  const hintKeywords = _extractDailyHintKeywords(originalCorrect);
  const hintLead = hintKeywords.length
    ? `Look for the choice tied to ${hintKeywords.join(' / ')}.`
    : 'Look for the answer with the clearest cause-and-effect chain.';
  const hintCloser = String(originalCorrect || '').trim()
    ? `Closer hint: the right choice starts with "${String(originalCorrect).trim().slice(0, 18)}".`
    : 'Closer hint: the right choice is the most direct market consequence.';

  return {
    ...base,
    id: `daily-${dateString}`,
    questionId: `daily-${dateString}`,
    dailyDate: dateString,
    dailyNumber: getDailyQuestionNumber(dateString),
    baseIndex: index,
    answer: answerIndex,
    options: shuffledOptions,
    hints: [hintLead, hintCloser]
  };
}

function getDailyQuestion() {
  return DAILY_QUESTIONS[getDailyQuestionIndex(today())];
}
