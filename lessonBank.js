// ============================================================
// lessonBank.js — Finlingo complete lesson library
//
// UNIT 1 — Money & Markets          lessons  1–15
// UNIT 2 — Investing for Everyone   lessons 16–25
// UNIT 3 — Reading Companies        lessons 26–45
// UNIT 4 — Wall Street & Deals      lessons 46–65
// UNIT 5 — Trading & Derivatives    lessons 66–82
// UNIT 6 — Macro & Global Markets   lessons 83–100
//
// Path model:
//   - all 6 units are visible at once
//   - Unit 1 is fully free
//   - Units 2–6 include a 3-lesson free preview
//   - remaining lessons require Gold (or Platinum)
//
// Each lesson object:
//   id        {number}   unique ID, matches UNITS_DEF ranges in data.js
//   tier      {string}   legacy content tier / difficulty hint
//   title     {string}   display name
//   unit      {string}   must match a name in UNITS_DEF exactly
//   blurb     {string}   one-line description for the home card
//   icon      {string}   key from ICONS in data.js
//   miniLessonContent {array} optional concept cards: [{ title, text }]
//   questions {array}    3–4 questions: { q, options[4], answer, explanation }
//
// Path access is derived from UNITS_DEF + previewLessonCount so the
// free-preview model stays centralized even when lesson difficulty tags differ.
//
// NOTE: COURSES reading content (in data.js) exists for lesson IDs 1–3.
//       quiz.js handles missing COURSES gracefully — lessons without a
//       matching COURSES entry skip straight to the quiz screen.
//
// Depends on: nothing (pure data)
// Load order: after data.js, before quiz.js
// ============================================================


const LESSONS = [


// ════════════════════════════════════════════════════════════
// UNIT 1 — Money & Markets (lessons 1–15)
// ════════════════════════════════════════════════════════════

  { id:1, tier:'standard', title:"What Is a Stock?",
    unit:"Money & Markets", blurb:"Own a tiny piece of a company.", icon:"stock",
    questions:[
      {q:"What is a stock?",options:["Ownership in a company","A type of bank loan","A government tax","A savings account"],answer:0,explanation:"A stock represents ownership (equity) in a company — when you buy shares you become a part-owner."},
      {q:"If you own shares of Apple, you are most accurately a:",options:["Lender only","Part-owner of Apple","Government bondholder","Bank depositor"],answer:1,explanation:"Shareholders are part-owners of the company, entitled to dividends and voting rights."},
      {q:"Stocks are generally associated with:",options:["Ownership potential and market risk","Guaranteed fixed return","FDIC insurance","Zero price movement"],answer:0,explanation:"Stocks can grow significantly in value but prices fluctuate — upside potential comes with downside risk."},
      {q:"A company's stock price primarily reflects:",options:["Book value only","What buyers and sellers agree it's worth","The company's age","Government regulations"],answer:1,explanation:"Stock prices are set by supply and demand — what investors are collectively willing to pay."}
    ]},

  { id:2, tier:'standard', title:"What Is a Bond?",
    unit:"Money & Markets", blurb:"Lending money for steady returns.", icon:"bond",
    questions:[
      {q:"When you buy a bond, you are essentially:",options:["Buying ownership in a company","Lending money to the issuer","Speculating on currencies","Buying commodities"],answer:1,explanation:"Bonds are debt instruments — the bondholder lends money to the issuer in exchange for interest payments."},
      {q:"The 'coupon' on a bond refers to:",options:["A discount code","The periodic interest payment","The bond's maturity date","The face value"],answer:1,explanation:"The coupon is the regular interest payment made to bondholders, expressed as a percentage of face value."},
      {q:"When interest rates rise, existing bond prices typically:",options:["Rise as well","Fall","Stay unchanged","Double"],answer:1,explanation:"Existing bonds become less attractive when new bonds offer higher yields, so their price falls."},
      {q:"Which type of bond is generally considered safest?",options:["Junk bonds","Corporate bonds","US Treasury bonds","Convertible bonds"],answer:2,explanation:"US Treasuries are backed by the US government — the global benchmark for risk-free assets."}
    ]},

  { id:3, tier:'standard', title:"What Is an ETF?",
    unit:"Money & Markets", blurb:"The bundle behind modern investing.", icon:"etf",
    questions:[
      {q:"ETF stands for:",options:["Equity Tax Fund","Exchange Traded Fund","Electronic Transfer Formula","Estimated Trading Flow"],answer:1,explanation:"ETF = Exchange Traded Fund. A basket of securities that trades on an exchange like a stock."},
      {q:"One key advantage of ETFs is:",options:["Guaranteed profits","Instant diversification","No market risk","They never lose value"],answer:1,explanation:"A single ETF can hold hundreds of stocks or bonds, giving immediate diversification in one transaction."},
      {q:"An S&P 500 ETF typically:",options:["Tracks 500 large US companies","Invests only in bonds","Focuses on one industry","Guarantees index-beating returns"],answer:0,explanation:"S&P 500 ETFs replicate the performance of the 500 largest publicly traded US companies."},
      {q:"ETFs differ from mutual funds mainly because:",options:["ETFs hold fewer assets","ETFs trade throughout the day on exchanges like stocks; mutual funds price once at end of day","ETFs are only for institutions","Mutual funds are always tax-free"],answer:1,explanation:"ETFs offer intraday liquidity — you can buy or sell at market prices throughout the trading day, just like a stock."}
    ]},

  { id:4, tier:'standard', title:"What Is an Index Fund?",
    unit:"Money & Markets", blurb:"The simplest way to own the whole market.", icon:"etf",
    questions:[
      {q:"An index fund is designed to:",options:["Beat the market through active selection","Track and replicate the performance of a specific market index","Focus on high-dividend stocks","Invest only in bonds"],answer:1,explanation:"Index funds passively track an index like the S&P 500 — buying every stock in proportion to its weight, with no active stock-picking."},
      {q:"Index funds typically offer lower fees than active funds because:",options:["They hold fewer stocks","They require less trading and management — no analysts or fund managers needed","They only invest in large companies","They are backed by the government"],answer:1,explanation:"Passive management is far cheaper than active — no team of analysts to pay, less turnover, and simpler operations. That cost saving passes to investors."},
      {q:"Over long time horizons, most actively managed funds:",options:["Consistently outperform index funds","Underperform or match index funds after fees","Guarantee above-market returns","Only hold S&P 500 companies"],answer:1,explanation:"Decades of data show the majority of active funds underperform their benchmark index over long periods, especially after accounting for management fees."}
    ]},

  { id:5, tier:'standard', title:"What Is a Mutual Fund?",
    unit:"Money & Markets", blurb:"Pooled investing managed by professionals.", icon:"etf",
    questions:[
      {q:"A mutual fund is best described as:",options:["A single stock","A pool of investor money managed collectively","A government savings account","A type of bond"],answer:1,explanation:"Mutual funds pool money from many investors to buy a diversified portfolio, managed by a professional fund manager."},
      {q:"The main difference between a mutual fund and an ETF is:",options:["Mutual funds hold stocks; ETFs hold bonds","Mutual funds price once daily; ETFs trade live throughout the day","Mutual funds are always actively managed","ETFs are only for institutions"],answer:1,explanation:"ETFs trade on exchanges like stocks throughout the day at market prices. Mutual fund orders execute at end-of-day NAV."},
      {q:"An actively managed mutual fund typically has:",options:["No fees","Lower fees than index ETFs","A fund manager making investment decisions","Guaranteed outperformance"],answer:2,explanation:"Active funds employ managers who choose securities — this is why they tend to carry higher expense ratios than passive index funds."}
    ]},

  { id:6, tier:'standard', title:"The S&P 500",
    unit:"Money & Markets", blurb:"The benchmark every investor watches.", icon:"stock",
    questions:[
      {q:"The S&P 500 is:",options:["A stock exchange","An index tracking the 500 largest publicly traded US companies by market cap","A government bond programme","A type of mutual fund"],answer:1,explanation:"The S&P 500 is a market-cap-weighted index of 500 large US companies — the most widely used benchmark for US equity performance."},
      {q:"'Market-cap weighted' in the S&P 500 means:",options:["All 500 stocks have equal weight","Larger companies by market value have a greater influence on the index","Companies are weighted by revenue","Weights are reassigned daily"],answer:1,explanation:"Apple, Microsoft, and Nvidia collectively represent a large share of the S&P 500 because they're the largest companies. A 10% move in Apple impacts the index more than a 10% move in a smaller member."},
      {q:"The S&P 500 is commonly used as a benchmark because:",options:["It contains all US stocks","It is widely regarded as representative of the US economy and is liquid, investable, and well-defined","It is government-managed","It includes only tech stocks"],answer:1,explanation:"Fund managers measure their performance against it. Passive investors replicate it. It's the reference point for almost all US equity discussion — the de facto standard."}
    ]},

  { id:7, tier:'standard', title:"Market Capitalisation",
    unit:"Money & Markets", blurb:"How big is a company, really?", icon:"stock",
    questions:[
      {q:"Market capitalisation is calculated as:",options:["Revenue × profit margin","Share price × total shares outstanding","Total assets − total liabilities","Annual earnings × P/E ratio"],answer:1,explanation:"Market cap = share price × shares outstanding. It reflects what the market currently values the entire company at."},
      {q:"A 'large-cap' company typically has a market cap of:",options:["Under $2 billion","$2–10 billion","Over $10 billion","Over $1 trillion"],answer:2,explanation:"Large-cap companies are generally defined as having market caps above $10 billion — they're established, less volatile names."},
      {q:"If a company's share price doubles but shares outstanding stay the same, its market cap:",options:["Stays the same","Doubles","Halves","Cannot be determined"],answer:1,explanation:"Market cap is directly proportional to price. Double the price with no change in shares = double the market cap."},
      {q:"Market cap represents:",options:["How much cash a company has","The total equity value as priced by the market","The company's annual revenue","The company's book value"],answer:1,explanation:"Market cap is a market-implied equity value — what public investors collectively believe the company's equity is worth right now."}
    ]},

  { id:8, tier:'standard', title:"Bull vs Bear Market",
    unit:"Money & Markets", blurb:"Reading the direction of the market.", icon:"stock",
    questions:[
      {q:"A bull market is generally defined as:",options:["A market that has fallen 20% or more","A market rising 20% or more from recent lows","Any market that is flat","A market dominated by bonds"],answer:1,explanation:"A bull market is a sustained upward trend — typically defined as a 20% rise from a recent trough, accompanied by investor optimism."},
      {q:"A bear market is typically defined as:",options:["A market rising quickly","A decline of 20% or more from recent highs","A market with no trading activity","A market rising on low volume"],answer:1,explanation:"A bear market is a sustained decline of 20% or more — historically accompanied by economic slowdown and low investor confidence."},
      {q:"Bull and bear markets are primarily driven by:",options:["Technical patterns only","Investor sentiment, economic conditions, and corporate earnings","Government regulations alone","Random chance"],answer:1,explanation:"Markets reflect collective expectations — corporate earnings, economic growth, and investor psychology all shape the direction and duration of bull and bear cycles."}
    ]},

  { id:9, tier:'standard', title:"Compound Interest",
    unit:"Money & Markets", blurb:"The engine behind long-term wealth.", icon:"compound",
    questions:[
      {q:"Compound interest means:",options:["You only earn on your original deposit","Your earnings generate their own earnings","Interest stops after one year","Only banks benefit"],answer:1,explanation:"Compounding is when you earn returns on your returns — gains get reinvested and generate their own gains."},
      {q:"Which phrase best captures compounding?",options:["Growth on growth","One-time return","Money shrinking","No reinvestment"],answer:0,explanation:"Compounding is exponential — your base grows, and so does the amount generating returns."},
      {q:"The Rule of 72 estimates:",options:["Your tax rate","How long to double money at a given rate","Your annual return","Your risk tolerance"],answer:1,explanation:"Divide 72 by your annual return rate to estimate doubling time. E.g., 72 ÷ 8% ≈ 9 years."},
      {q:"Compounding is most powerful when:",options:["You start late and invest a lot","You start early and stay invested","You trade frequently","You hold only cash"],answer:1,explanation:"Time is the biggest lever in compounding — starting even 5 years earlier can mean dramatically more wealth at retirement."}
    ]},

  { id:10, tier:'standard', title:"Inflation",
    unit:"Money & Markets", blurb:"Why your money buys less over time.", icon:"rates",
    questions:[
      {q:"Inflation is best defined as:",options:["An increase in stock prices","A general rise in the price level of goods and services over time","A rise in interest rates","A decrease in government spending"],answer:1,explanation:"Inflation measures how much the purchasing power of money declines as prices broadly rise across the economy."},
      {q:"The Consumer Price Index (CPI) measures:",options:["The stock market's performance","Changes in prices paid by consumers for a basket of goods and services","Corporate profit margins","Government debt levels"],answer:1,explanation:"CPI tracks the average price change over time for a standard basket of goods — the most widely used inflation gauge."},
      {q:"Inflation at 3% annually means:",options:["Your money doubles every 3 years","Something costing $100 today costs $103 next year","Stocks will rise 3%","Interest rates will fall 3%"],answer:1,explanation:"A 3% inflation rate means the same basket of goods costs 3% more after one year — your money's real purchasing power shrinks."}
    ]},

  { id:11, tier:'standard', title:"Nominal vs Real Return",
    unit:"Money & Markets", blurb:"Adjusting returns for the reality of inflation.", icon:"compound",
    questions:[
      {q:"The nominal return on an investment is:",options:["The return adjusted for inflation","The raw percentage gain before accounting for inflation","Only the dividend component","The return after taxes"],answer:1,explanation:"Nominal return is the unadjusted figure — the raw % change in value. It doesn't account for what inflation did to your purchasing power during that period."},
      {q:"If your portfolio gained 8% but inflation was 3%, your real return was approximately:",options:["11%","3%","5%","8%"],answer:2,explanation:"Real return ≈ nominal return − inflation rate. 8% − 3% = 5%. This is the actual increase in your purchasing power."},
      {q:"Why does the real return matter more than nominal for long-term investors?",options:["Nominal returns are unreliable","Real returns show what your money can actually buy — a 10% nominal gain in 9% inflation barely beats holding cash","Inflation doesn't affect stocks","Nominal returns are always negative"],answer:1,explanation:"If prices rise 9% and your portfolio grows 10%, you've barely stayed ahead. Wealth accumulation is about real purchasing power, not raw numbers."}
    ]},

  { id:12, tier:'standard', title:"Liquidity",
    unit:"Money & Markets", blurb:"How easily can you turn assets into cash?", icon:"rates",
    questions:[
      {q:"A liquid asset is one that:",options:["Earns the highest return","Can be quickly converted to cash without losing value","Has the lowest risk","Is only held by institutions"],answer:1,explanation:"Liquidity refers to how easily and quickly an asset can be sold at or near its current market value."},
      {q:"Which of the following is the most liquid asset?",options:["Real estate","Fine art","Cash or money market funds","Private equity"],answer:2,explanation:"Cash is perfectly liquid by definition. Money market funds are designed to maintain $1 NAV and redeem quickly."},
      {q:"A bid-ask spread is:",options:["The difference between a stock's high and low for the day","The gap between what buyers will pay and sellers will accept","A type of dividend","The broker's annual fee"],answer:1,explanation:"The bid-ask spread is the difference between the highest buy price and the lowest sell price — a direct measure of market liquidity. Tighter = more liquid."}
    ]},

  { id:13, tier:'standard', title:"Volatility",
    unit:"Money & Markets", blurb:"Measuring the swings in asset prices.", icon:"risk",
    questions:[
      {q:"Volatility in finance refers to:",options:["A stock's average return","The degree of price fluctuation over time","How often a stock pays dividends","A company's debt level"],answer:1,explanation:"Volatility measures how much an asset's price moves — higher volatility means larger and more frequent price swings."},
      {q:"Standard deviation is commonly used to measure volatility because it:",options:["Shows the average price","Quantifies how much returns vary from the average","Predicts future prices","Measures dividend yield"],answer:1,explanation:"Standard deviation captures the spread of returns around the mean — a higher standard deviation means more unpredictable, volatile returns."},
      {q:"The VIX index is often called the 'fear gauge' because it measures:",options:["The S&P 500's price level","Implied volatility in S&P 500 options — market expectations of near-term volatility","The Federal Reserve's interest rate","Bond market returns"],answer:1,explanation:"The VIX uses options pricing to estimate how much volatility the market expects over the next 30 days. High VIX = high market fear."}
    ]},

  { id:14, tier:'standard', title:"Risk vs Reward",
    unit:"Money & Markets", blurb:"The fundamental tradeoff in every investment.", icon:"risk",
    questions:[
      {q:"The risk-return tradeoff states that:",options:["Higher risk always leads to higher returns","To have a chance at higher returns, investors must accept higher potential for loss","Low-risk assets always underperform","The market has no relationship between risk and return"],answer:1,explanation:"Higher potential returns come with greater uncertainty. There's no free lunch — a Treasury bill is safe but yields little; equities are volatile but have historically returned more. This tradeoff is the foundation of modern finance."},
      {q:"Which asset class has historically offered the highest long-term return — and highest short-term volatility?",options:["Government bonds","Cash in a savings account","Equities (stocks)","Certificates of deposit"],answer:2,explanation:"Stocks have outperformed bonds, cash, and real estate over most long time horizons — but with significant short-term swings. The extra return compensates investors for bearing that volatility. This premium is called the equity risk premium."},
      {q:"Risk in investing is best understood as:",options:["Only the chance of losing money","The possibility that actual returns deviate from expected returns — in either direction","The fee your broker charges","The chance of picking the wrong stock"],answer:1,explanation:"Risk is technically symmetric — outcomes could be better or worse than expected. Most investors focus on downside risk, but understanding which type of risk you're taking is the first step to managing it well."}
    ]},

  { id:15, tier:'standard', title:"Diversification",
    unit:"Money & Markets", blurb:"Not putting all your eggs in one basket.", icon:"etf",
    questions:[
      {q:"The core principle of diversification is that:",options:["Owning more stocks always reduces all risk","Holding uncorrelated assets reduces overall portfolio volatility","Bonds always protect against stock losses","Diversification guarantees positive returns"],answer:1,explanation:"When some assets fall, others may hold or rise — if they're not perfectly correlated. The weighted combination reduces the portfolio's overall volatility."},
      {q:"Systematic risk (also called market risk) is:",options:["Risk that can be eliminated by diversification","Risk inherent to the entire market that cannot be diversified away","Company-specific risk","Only relevant for bonds"],answer:1,explanation:"No matter how diversified you are, you can't diversify away market-wide risk — a global recession or crisis affects everything. This is systematic risk."},
      {q:"Geographic diversification helps by:",options:["Eliminating currency risk","Reducing concentration in any single country's economic cycles","Guaranteeing higher returns","Replacing the need for bonds"],answer:1,explanation:"Different countries grow at different rates and face different risks. International exposure means a US recession doesn't affect your entire portfolio."}
    ]},


// ════════════════════════════════════════════════════════════
// UNIT 2 — Investing for Everyone (lessons 16–25)
// ════════════════════════════════════════════════════════════

  { id:16, tier:'standard', title:"Dividend",
    unit:"Investing for Everyone", blurb:"Getting paid just for owning shares.", icon:"compound",
    questions:[
      {q:"A dividend is:",options:["A type of bond","A cash payment from a company to its shareholders","A fee charged by brokers","A tax on capital gains"],answer:1,explanation:"Dividends are cash distributions from a company's profits, paid out to shareholders — usually on a quarterly basis."},
      {q:"The ex-dividend date is important because:",options:["It is when dividends are paid","Buyers on or after this date do NOT receive the upcoming dividend","It determines the tax rate on dividends","It is when dividends are announced"],answer:1,explanation:"To receive the next dividend, you must own shares before the ex-dividend date. Buying on or after means missing that payment."},
      {q:"A stock's dividend yield is calculated as:",options:["Annual dividend / share price × 100","Share price / earnings per share","Earnings per share / dividend","Market cap / dividend"],answer:0,explanation:"Dividend yield = annual dividend per share ÷ stock price × 100. A $2 annual dividend on a $40 stock gives a 5% yield."}
    ]},

  { id:17, tier:'standard', title:"Capital Gains",
    unit:"Investing for Everyone", blurb:"Profits from selling investments.", icon:"stock",
    questions:[
      {q:"A capital gain occurs when:",options:["You receive a dividend","You sell an asset for more than you paid for it","You buy more shares","Interest rates fall"],answer:1,explanation:"A capital gain is the profit realised when you sell an investment at a higher price than your purchase cost."},
      {q:"The difference between short-term and long-term capital gains is:",options:["Whether you bought stocks or bonds","How long you held the asset — typically short-term is under 1 year","Whether you used a broker","The country where you invest"],answer:1,explanation:"In most tax systems, long-term gains (held over 1 year) are taxed at lower rates than short-term gains — encouraging longer holding periods."},
      {q:"'Unrealised' gains refer to:",options:["Dividends not yet paid","Profits on paper — the asset has increased in value but hasn't been sold","Losses that exceed your investment","Gains earned tax-free"],answer:1,explanation:"Unrealised gains exist on paper — your investment is worth more, but no taxable event occurs until you actually sell."}
    ]},

  { id:18, tier:'standard', title:"Dollar-Cost Averaging",
    unit:"Investing for Everyone", blurb:"Investing on autopilot through market swings.", icon:"compound",
    questions:[
      {q:"Dollar-cost averaging (DCA) involves:",options:["Investing all your money at once","Investing a fixed amount at regular intervals regardless of price","Only buying when prices are low","Selling when prices rise and buying when they fall"],answer:1,explanation:"DCA means committing to invest a fixed amount (e.g. $500/month) consistently — no matter what the market is doing. You buy more shares when prices are low, fewer when high."},
      {q:"The main psychological benefit of DCA is:",options:["Guaranteeing higher returns","Removing the pressure to time the market perfectly","Maximising returns in bull markets","Avoiding all investment risk"],answer:1,explanation:"DCA eliminates the paralysis of 'should I invest now or wait?' — you commit to a schedule and follow it. This prevents emotional decision-making."},
      {q:"Compared to lump-sum investing, DCA typically:",options:["Outperforms in all market conditions","Underperforms in a consistently rising market but reduces risk in volatile or falling markets","Eliminates all downside risk","Guarantees a better average entry price"],answer:1,explanation:"If markets only go up, a lump sum invested now outperforms DCA. But in volatile or declining markets, DCA's consistent buying reduces the average cost per share."}
    ]},

  { id:19, tier:'standard', title:"Asset Allocation",
    unit:"Investing for Everyone", blurb:"Splitting your portfolio with intention.", icon:"etf",
    questions:[
      {q:"Asset allocation refers to:",options:["Picking individual winning stocks","How you divide your portfolio across different asset classes","A type of bond fund","The fee structure of a fund"],answer:1,explanation:"Asset allocation is the strategic split of investments across categories — stocks, bonds, cash, real estate, etc. — to balance risk and return."},
      {q:"Which factor most influences your ideal asset allocation?",options:["Current stock market levels","Your risk tolerance and time horizon","Your broker's recommendation","The current inflation rate alone"],answer:1,explanation:"How much risk you can bear (emotionally and financially) and how long you have to invest are the primary drivers of the right allocation for you."},
      {q:"The '60/40 portfolio' refers to:",options:["60% bonds, 40% stocks","60% stocks, 40% bonds","60% US stocks, 40% international","60% cash, 40% equities"],answer:1,explanation:"The classic 60/40 portfolio holds 60% stocks for growth and 40% bonds for stability — a historically popular allocation for moderate risk tolerance."}
    ]},

  { id:20, tier:'standard', title:"Risk Tolerance",
    unit:"Investing for Everyone", blurb:"How much uncertainty can you actually handle?", icon:"risk",
    questions:[
      {q:"Risk tolerance in investing refers to:",options:["How much debt you have","Your ability and willingness to handle potential investment losses","Your annual income","How long you have been investing"],answer:1,explanation:"Risk tolerance is a combination of your financial capacity to absorb losses and your emotional comfort with market volatility — both must align with your portfolio."},
      {q:"A young investor with a long time horizon and stable income can generally afford:",options:["A lower risk tolerance","A higher risk tolerance because losses have time to recover","No equity exposure","The same risk as a retiree"],answer:1,explanation:"Time is the greatest ally in investing. A 25-year-old who loses 30% in a crash has decades to recover — their risk capacity is far higher than someone needing the money in 5 years."},
      {q:"If you would sell your investments in a 30% market crash, you:",options:["Have high risk tolerance","Have lower risk tolerance than you thought","Are making a wise decision","Have an aggressive portfolio allocation"],answer:1,explanation:"Behavioural risk tolerance — what you actually do in a real crash — often differs from how you feel about risk in calm markets. The 2008 and 2020 crashes revealed many investors had overestimated their tolerance."}
    ]},

  { id:21, tier:'standard', title:"Portfolio Rebalancing",
    unit:"Investing for Everyone", blurb:"Keeping your portfolio on target.", icon:"etf",
    questions:[
      {q:"Portfolio rebalancing means:",options:["Adding new money to your portfolio","Selling overperforming assets and buying underperforming ones to restore your target allocation","Switching to a different broker","Diversifying into more asset classes"],answer:1,explanation:"Rebalancing restores your intended asset allocation after market movements have shifted it. Strong performers are trimmed; underweights are topped up."},
      {q:"Why does a portfolio drift out of balance over time?",options:["Dividends are reinvested automatically","Different assets grow at different rates, causing their portfolio weightings to shift","Inflation erodes bond values only","Brokers change allocations"],answer:1,explanation:"If stocks rise faster than bonds, your 60/40 portfolio might drift to 70/30. Rebalancing sells some equity exposure to restore the intended split."},
      {q:"One tax-efficient way to rebalance is to:",options:["Sell everything and start fresh","Direct new contributions to underweight asset classes before selling overweights","Rebalance daily","Switch to a 100% stock portfolio"],answer:1,explanation:"Adding new money to underweight areas avoids triggering capital gains taxes from selling. You bring the portfolio back toward target without creating taxable events."}
    ]},

  { id:22, tier:'standard', title:"Passive vs Active Investing",
    unit:"Investing for Everyone", blurb:"Two philosophies, two very different costs.", icon:"etf",
    questions:[
      {q:"Passive investing aims to:",options:["Beat the market through research and stock selection","Match the market return by tracking an index at low cost","Outperform peers through tactical trading","Focus on dividend-paying stocks only"],answer:1,explanation:"Passive investing accepts market returns — it tracks an index, replicates its holdings, and minimises fees rather than trying to beat the benchmark."},
      {q:"The primary argument FOR active investing is:",options:["It is cheaper than passive","Skilled managers can consistently identify mispriced securities","Index funds are illegal in some markets","It is always less risky"],answer:1,explanation:"Active managers argue they can exploit mispricing and generate alpha — though evidence shows this is difficult to sustain consistently over long periods."},
      {q:"The expense ratio of a typical passive index fund compared to an active fund is:",options:["Higher","Similar","Much lower","Depends on the country"],answer:2,explanation:"Index ETFs often charge 0.03–0.20% annually. Active funds typically charge 0.5–1.5%+. The cost difference compounds significantly over decades."}
    ]},

  { id:23, tier:'standard', title:"Growth vs Value Stocks",
    unit:"Investing for Everyone", blurb:"Two ways to find the right investment.", icon:"stock",
    questions:[
      {q:"A growth stock is typically characterised by:",options:["High dividend yield and low valuation","High expected earnings growth, often trading at a premium","A P/E ratio below the market average","Stable earnings with slow growth"],answer:1,explanation:"Growth stocks are companies expected to grow faster than average. Investors pay a premium for that future growth potential — think early Amazon or Nvidia."},
      {q:"A value stock is typically:",options:["A company with the highest stock price","A company trading at a discount to its intrinsic worth","Always a dividend payer","A startup with high growth potential"],answer:1,explanation:"Value investing (made famous by Warren Buffett) looks for companies trading below what they're intrinsically worth — a margin of safety against downside."},
      {q:"During high interest rate environments, growth stocks tend to:",options:["Outperform value stocks","Underperform value stocks because future earnings are discounted more heavily","Remain unaffected","Trade at higher valuations"],answer:1,explanation:"Growth stocks rely on future earnings. Higher discount rates reduce the present value of those distant profits — making them less attractive relative to value stocks."}
    ]},

  { id:24, tier:'standard', title:"Market Cycles",
    unit:"Investing for Everyone", blurb:"Expansion, peak, contraction, trough.", icon:"compound",
    questions:[
      {q:"The four phases of a typical market cycle are:",options:["Buy, hold, sell, repeat","Expansion, peak, contraction, trough","Bull, bear, crash, recovery","Up, flat, down, flat"],answer:1,explanation:"Economic and market cycles typically move through expansion (growth), peak (maximum output), contraction (slowdown), and trough (lowest point) before recovery begins."},
      {q:"During the contraction phase, investors typically see:",options:["Rising stock prices and strong earnings","Falling stock prices, rising unemployment, and declining earnings","Stable prices and full employment","High inflation and rising interest rates only"],answer:1,explanation:"Contraction means the economy is slowing — companies earn less, unemployment rises, and stock prices typically fall as investors price in lower future earnings."},
      {q:"Why is it generally difficult to 'time the market' cycle?",options:["Market cycles are too short","Turning points are only clearly visible in retrospect","Cycles are identical each time","Only institutional investors can see cycle data"],answer:1,explanation:"Identifying the peak or trough in real time is nearly impossible — it's only obvious in hindsight. This is why most financial advisors advocate staying invested rather than trying to time cycles."}
    ]},

  { id:25, tier:'standard', title:"IPO",
    unit:"Investing for Everyone", blurb:"When private companies go public.", icon:"ipo",
    questions:[
      {q:"IPO stands for:",options:["Internal Price Offering","Initial Public Offering","Integrated Portfolio Option","Institutional Purchase Order"],answer:1,explanation:"An IPO is when a private company first sells shares to the public on a stock exchange."},
      {q:"The 'underwriter' in an IPO is typically:",options:["The company's accountant","An investment bank managing the offering","The stock exchange itself","The SEC"],answer:1,explanation:"Investment banks underwrite IPOs — they price shares, find buyers, and stabilise trading post-listing."},
      {q:"A company's lock-up period prevents:",options:["Trading by the public","Early insiders from selling","The company from issuing more stock","Short sellers"],answer:1,explanation:"Lock-up periods (90–180 days) prevent insiders from flooding the market with shares after the IPO."},
      {q:"A SPAC is:",options:["A mutual fund","A shell company that acquires a private firm to go public","A type of bond","A small-cap ETF"],answer:1,explanation:"SPACs raise capital via IPO with the goal of merging with a private company — an alternative path to going public."}
    ]},


// ════════════════════════════════════════════════════════════
// UNIT 3 — Reading Companies (lessons 26–45, gold)
// ════════════════════════════════════════════════════════════

  { id:26, tier:'gold', title:"Revenue vs Profit",
    unit:"Reading Companies", blurb:"Top line vs bottom line — a crucial difference.", icon:"ebitda",
    questions:[
      {q:"Revenue (top line) is:",options:["Profit after all expenses","The total money generated from sales before expenses","Cash held by the company","Earnings available to shareholders"],answer:1,explanation:"Revenue is simply how much the company sold — before deducting any costs. It's the first line on the income statement, hence 'top line'."},
      {q:"A company can have high revenue but low profit if:",options:["It pays high dividends","Its costs and expenses are also high","It has too much cash","Its stock price has fallen"],answer:1,explanation:"Revenue tells you how big the business is. Profit tells you how efficient it is. High costs (manufacturing, salaries, interest) can consume most or all of that revenue."},
      {q:"Which metric best represents the financial health of a business?",options:["Revenue alone","A combination — revenue shows scale, while profit margin shows efficiency","Stock price","Number of employees"],answer:1,explanation:"No single number tells the full story. A fast-growing company may have thin margins by design. A profitable company with no revenue growth may be stagnating. Both matter."}
    ]},

  { id:27, tier:'gold', title:"Gross Margin",
    unit:"Reading Companies", blurb:"The profitability of the core product.", icon:"ebitda",
    questions:[
      {q:"Gross margin is calculated as:",options:["Net income / revenue","(Revenue − Cost of Goods Sold) / Revenue","EBITDA / enterprise value","Operating income / revenue"],answer:1,explanation:"Gross margin = (Revenue − COGS) ÷ Revenue. It measures how much of each dollar of revenue remains after paying the direct costs of producing the product or service."},
      {q:"A software company typically has a high gross margin because:",options:["Software requires expensive raw materials","The marginal cost of delivering software to an additional customer is near zero","Software companies don't pay employees","They charge high prices"],answer:1,explanation:"Once software is built, distributing it costs almost nothing. A company that sells $100M of software for $5M in delivery costs has a 95% gross margin."},
      {q:"Declining gross margins over time could indicate:",options:["Improving cost controls","Rising input costs or pricing pressure from competitors","A new product launch","Tax rate changes"],answer:1,explanation:"If a company must cut prices to compete, or raw material costs rise, gross margin shrinks. Sustained margin compression often signals competitive or supply chain pressure."}
    ]},

  { id:28, tier:'gold', title:"Operating Margin",
    unit:"Reading Companies", blurb:"Profit after running the whole business.", icon:"ebitda",
    questions:[
      {q:"Operating margin includes:",options:["Only the cost of goods sold","COGS plus operating expenses like R&D, marketing, and admin (SG&A)","Interest and taxes","Dividends paid"],answer:1,explanation:"Operating income = Revenue − COGS − Operating Expenses. Operating margin shows profitability from the core business before financing costs (interest) and taxes."},
      {q:"The difference between gross margin and operating margin is:",options:["Taxes","Operating expenses like salaries, marketing, and R&D not directly tied to production","Depreciation only","Interest on debt"],answer:1,explanation:"Gross margin only deducts production costs. Operating margin also deducts overhead — administrative salaries, marketing, R&D, facilities. It's a fuller picture of business efficiency."},
      {q:"A company with a 10% operating margin earns:",options:["$10 profit per dollar of revenue","$0.10 of operating profit for every $1 of revenue","10x its COGS in profit","10% return on equity"],answer:1,explanation:"Operating margin is expressed as a percentage of revenue. 10% means for every $100 in sales, $10 is left after covering the costs of running the business — before interest and taxes."}
    ]},

  { id:29, tier:'gold', title:"Net Margin",
    unit:"Reading Companies", blurb:"The final profit after everything.", icon:"ebitda",
    questions:[
      {q:"Net margin is calculated as:",options:["EBITDA / revenue","Net income / revenue","Operating income / revenue","Gross profit / total assets"],answer:1,explanation:"Net margin = Net Income ÷ Revenue. It's the bottom line — what percentage of revenue actually becomes profit after ALL expenses: COGS, opex, interest, and taxes."},
      {q:"A company with $1B revenue and $50M net income has a net margin of:",options:["50%","5%","0.5%","20%"],answer:1,explanation:"$50M ÷ $1,000M = 5%. For every $100 in revenue, $5 was converted to profit after all expenses were paid."},
      {q:"Industries like grocery retail typically have net margins of:",options:["20–30%","1–3%","10–15%","Over 50%"],answer:1,explanation:"Grocery is a volume, low-margin business — fierce competition and high operating costs result in razor-thin net margins. Software, by contrast, can achieve 20–35%+ net margins."}
    ]},

  { id:30, tier:'gold', title:"Earnings Per Share (EPS)",
    unit:"Reading Companies", blurb:"The profit figure that moves markets.", icon:"stock",
    questions:[
      {q:"Earnings per share (EPS) is calculated as:",options:["Revenue / total shares","Net income / total shares outstanding","Share price / earnings","Dividends / share price"],answer:1,explanation:"EPS = net income ÷ shares outstanding. It shows how much profit the company earned per share of stock."},
      {q:"Diluted EPS accounts for:",options:["Taxes and interest","The potential conversion of options, warrants, and convertible bonds into shares","Only common shares","Share buybacks"],answer:1,explanation:"Diluted EPS assumes all convertible instruments are exercised — giving a more conservative (lower) per-share earnings figure."},
      {q:"If a company beats earnings estimates, the stock typically:",options:["Always falls","Often rises, as better-than-expected results are rewarded","Is unaffected","Pays a special dividend"],answer:1,explanation:"Markets are forward-looking. Beating estimates is a positive surprise — it means the company is performing better than the consensus expected, often triggering a price rise."}
    ]},

  { id:31, tier:'gold', title:"Price-to-Earnings Ratio (P/E)",
    unit:"Reading Companies", blurb:"The market's favourite valuation shortcut.", icon:"valuation",
    questions:[
      {q:"The P/E ratio is calculated as:",options:["Profit / equity","Share price / earnings per share","Earnings / market cap","Revenue / share price"],answer:1,explanation:"P/E = share price ÷ earnings per share. A P/E of 20 means you're paying $20 for every $1 of annual earnings."},
      {q:"A higher P/E ratio generally means investors expect:",options:["Lower future earnings","Faster future earnings growth","The company to go bankrupt","Lower stock price volatility"],answer:1,explanation:"High P/E stocks command a premium because investors believe earnings will grow fast enough to justify the price. Growth stocks often carry high P/E ratios."},
      {q:"The forward P/E uses:",options:["Past 12 months of earnings","Projected earnings for the next 12 months","Earnings from 5 years ago","The highest earnings the company has ever reported"],answer:1,explanation:"Forward P/E uses analyst estimates for future earnings — giving a forward-looking picture of valuation rather than backward-looking."}
    ]},

  { id:32, tier:'gold', title:"Dividend Yield",
    unit:"Reading Companies", blurb:"Measuring the income a stock pays you.", icon:"compound",
    questions:[
      {q:"Dividend yield measures:",options:["Total return including price appreciation","Annual dividend income as a percentage of the current share price","The frequency of dividend payments","Dividend growth rate over 5 years"],answer:1,explanation:"Dividend yield = annual dividend per share ÷ current stock price × 100. A $4 dividend on a $100 stock yields 4%."},
      {q:"If a stock's price falls while its dividend stays the same, its yield:",options:["Falls","Rises","Stays the same","Goes to zero"],answer:1,explanation:"Since yield = dividend ÷ price, a lower price means the same dividend represents a higher percentage of your investment — yield rises."},
      {q:"A very high dividend yield can sometimes signal:",options:["Outstanding company health","That the stock price has fallen sharply, possibly due to financial distress","Government support","A recent share buyback"],answer:1,explanation:"A suspiciously high yield often means the stock price has dropped due to problems — the market may be pricing in a dividend cut. Always investigate why the yield is elevated."}
    ]},

  { id:33, tier:'gold', title:"Share Buybacks",
    unit:"Reading Companies", blurb:"When companies buy their own stock.", icon:"stock",
    questions:[
      {q:"A share buyback (repurchase) involves:",options:["The company issuing new shares to employees","The company purchasing its own outstanding shares from the market","Investors buying shares from each other","The government buying company stock"],answer:1,explanation:"Buybacks reduce the number of shares in circulation — the company uses excess cash to repurchase its own stock from public investors."},
      {q:"Buybacks increase earnings per share because:",options:["They increase net income","They reduce shares outstanding, spreading the same earnings across fewer shares","They reduce debt","They increase dividends"],answer:1,explanation:"EPS = net income ÷ shares. Fewer shares outstanding means the same net income divided by a smaller number — EPS rises even if profits don't."},
      {q:"Compared to dividends, buybacks are generally considered:",options:["More tax-efficient for investors in most jurisdictions","Less tax-efficient","Exactly the same tax treatment","Taxed as ordinary income"],answer:0,explanation:"In many countries, dividends are taxed when received. Buybacks create value through price appreciation, which is only taxed when the investor chooses to sell — giving more tax timing flexibility."}
    ]},

  { id:34, tier:'gold', title:"EBITDA",
    unit:"Reading Companies", blurb:"A core metric in banking and valuation.", icon:"ebitda",
    questions:[
      {q:"EBITDA stands for:",options:["Earnings Before Interest, Taxes, Depreciation, and Amortization","Equity Before Income, Trade, Debt, and Assets","Estimated Business Income During Tax Adjustments","Earnings Beyond Investment Trading Activities"],answer:0,explanation:"EBITDA strips out interest, taxes, and non-cash items to show core operating performance."},
      {q:"EBITDA helps compare companies by focusing on:",options:["Operations before financing and non-cash effects","Stock price performance","Dividend yield","All debt payments"],answer:0,explanation:"By removing financing, taxes, and D&A effects, EBITDA enables apples-to-apples comparisons across companies with different capital structures."},
      {q:"EV/EBITDA is commonly used as a:",options:["Valuation multiple","Stock screening tool only","Government metric","HR indicator"],answer:0,explanation:"EV/EBITDA is one of the most widely used valuation metrics in investment banking and M&A — it compares total company value to operating cash generation."}
    ]},

  { id:35, tier:'gold', title:"Free Cash Flow",
    unit:"Reading Companies", blurb:"The cash a business actually generates.", icon:"rates",
    questions:[
      {q:"Free cash flow (FCF) is calculated as:",options:["Net income + depreciation","Operating cash flow minus capital expenditure","Revenue minus cost of goods","EBITDA minus taxes"],answer:1,explanation:"FCF = Operating Cash Flow − Capital Expenditure. It represents the cash left after paying for investments in the business — what's truly available to investors or for debt repayment."},
      {q:"Why do investors often prefer FCF over net income?",options:["Net income is harder to calculate","FCF is harder to manipulate through accounting choices — it reflects actual cash movement","FCF is always higher","Net income excludes depreciation"],answer:1,explanation:"Net income is subject to accounting accruals and non-cash items. Free cash flow is what actually hits the bank account — it's harder to fake and a better measure of business health."},
      {q:"A company with strong earnings but negative free cash flow might indicate:",options:["Exceptional business health","Heavy capital investment or working capital issues — earnings may not be translating to cash","Tax avoidance","Dividend cuts imminent"],answer:1,explanation:"Negative FCF despite profits suggests cash is being consumed — by capex, inventory build-ups, or receivables. It raises questions about whether earnings are sustainable."}
    ]},

  { id:36, tier:'gold', title:"Enterprise Value",
    unit:"Reading Companies", blurb:"The full price tag of a business.", icon:"ebitda",
    questions:[
      {q:"Enterprise Value (EV) is best described as:",options:["The market capitalisation of a company","The total acquisition cost of a company — market cap plus net debt","The book value of assets","Annual revenue"],answer:1,explanation:"EV = Market Cap + Total Debt − Cash. It represents the theoretical total cost to buy and own the entire business, net of its cash holdings."},
      {q:"Why do analysts use EV rather than market cap when comparing companies?",options:["Market cap is harder to calculate","EV accounts for differences in capital structure — debt levels — making comparisons more meaningful","EV is always smaller","Market cap ignores dividends"],answer:1,explanation:"Two companies with the same market cap but very different debt levels are not equally 'valued' — EV normalises for that. A heavily indebted company is 'more expensive' to truly acquire."},
      {q:"If a company has a market cap of $500M, debt of $200M, and cash of $50M, its EV is:",options:["$500M","$650M","$750M","$450M"],answer:1,explanation:"EV = $500M + $200M − $50M = $650M. The cash is subtracted because an acquirer would effectively receive it upon purchase."}
    ]},

  { id:37, tier:'gold', title:"Discounted Cash Flow (DCF)",
    unit:"Reading Companies", blurb:"What are future earnings worth today?", icon:"valuation",
    questions:[
      {q:"The central idea of DCF valuation is:",options:["Past profits predict future value","A dollar received in the future is worth less than a dollar today","Companies are worth their book value","Revenue drives valuation"],answer:1,explanation:"DCF is based on the time value of money — future cash flows are discounted to reflect that receiving $100 in 10 years is less valuable than $100 today."},
      {q:"The discount rate in a DCF represents:",options:["The tax rate","The required rate of return (often WACC) that reflects the riskiness of the cash flows","The dividend yield","The growth rate"],answer:1,explanation:"The discount rate captures the opportunity cost — what return you'd require given the risk. Higher risk = higher discount rate = lower present value."},
      {q:"Terminal value in a DCF accounts for:",options:["The first 5 years of projections","Cash flows beyond the explicit projection period — often representing 60–80% of total value","The cost of capital","The company's cash balance"],answer:1,explanation:"DCF models typically project 5–10 years explicitly, then use a terminal value formula to capture all remaining value. This residual value often dominates the total."}
    ]},

  { id:38, tier:'gold', title:"WACC",
    unit:"Reading Companies", blurb:"The cost of all capital combined.", icon:"valuation",
    questions:[
      {q:"WACC stands for:",options:["Weighted Annual Capital Contribution","Weighted Average Cost of Capital","Working Asset Capital Calculation","Weighted Accrual Cost Check"],answer:1,explanation:"WACC is the blended cost of a company's capital sources — both equity and debt — weighted by their proportions in the capital structure."},
      {q:"WACC is used as the discount rate in DCF because:",options:["It is always the lowest available rate","It represents the minimum return a company must earn to satisfy all its capital providers","It equals the risk-free rate","It is set by regulators"],answer:1,explanation:"Equity holders and debt holders each have a required return. WACC averages these, weighted by how much of each is used — setting the hurdle rate for investment decisions."},
      {q:"A company with a higher proportion of equity in its capital structure will typically have a:",options:["Lower WACC (equity is cheaper than debt)","Higher WACC (equity is costlier than debt)","The same WACC","A WACC equal to the risk-free rate"],answer:1,explanation:"Equity is generally more expensive than debt because equity holders take more risk and debt interest is tax-deductible. More equity = higher overall cost of capital."}
    ]},

  { id:39, tier:'gold', title:"Valuation Methods (Comps)",
    unit:"Reading Companies", blurb:"What is a company really worth?", icon:"valuation",
    questions:[
      {q:"DCF stands for:",options:["Discounted Cash Flow","Debt Coverage Formula","Dividend Cash Factor","Dynamic Capital Funding"],answer:0,explanation:"Discounted Cash Flow analysis values a company by projecting future cash flows and discounting to present value using the required rate of return."},
      {q:"A comparable company analysis ('comps') involves:",options:["Analysing history only","Comparing to similar public companies' multiples — EV/EBITDA, P/E, EV/Revenue","Asking the CEO for the price","Using only book value"],answer:1,explanation:"Comps benchmarks a company against similar public companies using trading multiples. If peers trade at 10x EBITDA and your company generates $50M EBITDA, $500M is a starting point for value."},
      {q:"A higher discount rate in a DCF generally:",options:["Increases the valuation","Decreases the valuation","Has no effect","Doubles future cash flows"],answer:1,explanation:"A higher discount rate reduces the present value of future cash flows, lowering the company valuation — which is why rising interest rates often compress stock market multiples."}
    ]},

  { id:40, tier:'gold', title:"Beta",
    unit:"Reading Companies", blurb:"How much does this stock move with the market?", icon:"risk",
    questions:[
      {q:"A stock with a beta of 1.5 tends to:",options:["Move at the same rate as the market","Move 50% more than the market in either direction","Move 50% less than the market","Not correlate with the market at all"],answer:1,explanation:"Beta measures relative volatility. A beta of 1.5 means when the S&P 500 rises 10%, this stock tends to rise 15% — and falls 15% when the market falls 10%."},
      {q:"A defensive stock with a beta of 0.4 would be expected to:",options:["Rise more than the market in a rally","Fall more than the market in a downturn","Move much less than the overall market in both directions","Be uncorrelated with markets"],answer:2,explanation:"Low-beta stocks are less sensitive to market swings. They don't rise as much in bull markets, but they protect better in bear markets — utilities and consumer staples often have low betas."},
      {q:"Beta is calculated relative to:",options:["The risk-free rate","A benchmark like the S&P 500","The company's historical earnings","Its peer group only"],answer:1,explanation:"Beta is measured against a benchmark index, usually the S&P 500 for US stocks. It captures how correlated and how volatile the stock is versus that benchmark."}
    ]},

  { id:41, tier:'gold', title:"Alpha",
    unit:"Reading Companies", blurb:"Returns above and beyond the market.", icon:"valuation",
    questions:[
      {q:"In investing, alpha represents:",options:["The total return of a portfolio","Returns generated above a benchmark on a risk-adjusted basis","The volatility of a portfolio","A measure of company earnings"],answer:1,explanation:"Alpha is the excess return an investment achieves compared to its expected return given its risk (beta). A positive alpha means the manager added value beyond market returns."},
      {q:"If a fund manager's portfolio returned 15% while the S&P 500 returned 12% at equal risk, the alpha is approximately:",options:["12%","3%","27%","−3%"],answer:1,explanation:"Alpha ≈ actual return − expected return. 15% − 12% = 3% alpha. The manager generated 3 percentage points of excess return."},
      {q:"The efficient market hypothesis suggests that consistently achieving positive alpha is:",options:["Easy if you work hard","Difficult because prices already reflect all available information","Only possible for hedge funds","Guaranteed with fundamental analysis"],answer:1,explanation:"If markets are truly efficient, all public information is already priced in — leaving no consistent edge to exploit. Most evidence shows alpha is rare and tends to disappear over time."}
    ]},

  { id:42, tier:'gold', title:"Sharpe Ratio",
    unit:"Reading Companies", blurb:"Was that return worth the risk taken?", icon:"valuation",
    questions:[
      {q:"The Sharpe Ratio measures:",options:["Absolute portfolio return","Return earned per unit of risk, adjusted for the risk-free rate","How correlated a portfolio is to the market","The maximum loss in a portfolio"],answer:1,explanation:"Sharpe Ratio = (Portfolio Return − Risk-Free Rate) ÷ Standard Deviation. It answers: how much excess return did you earn for each unit of volatility accepted?"},
      {q:"A higher Sharpe Ratio indicates:",options:["Greater absolute returns","Better risk-adjusted performance — more return per unit of risk","Higher portfolio volatility","More diversified holdings"],answer:1,explanation:"Two funds may have the same 12% return, but if Fund A took twice the risk to get there, Fund B's Sharpe Ratio is higher — it was a better investment per unit of risk."},
      {q:"If two portfolios have identical returns, the one with the lower standard deviation has:",options:["A lower Sharpe Ratio","A higher Sharpe Ratio","The same Sharpe Ratio","No meaningful Sharpe Ratio"],answer:1,explanation:"Lower standard deviation means lower risk. Since Sharpe = excess return ÷ standard deviation, less risk in the denominator gives a higher ratio — better risk efficiency."}
    ]},

  { id:43, tier:'gold', title:"Growth Stocks (Deep Dive)",
    unit:"Reading Companies", blurb:"What makes a great growth company tick.", icon:"stock",
    questions:[
      {q:"A defining characteristic of a growth company is:",options:["Paying large dividends to shareholders","Reinvesting most profits into expansion rather than returning cash to shareholders","Trading below book value","Having stable, predictable earnings with little growth"],answer:1,explanation:"Growth companies prioritise future market share over current income. Amazon famously earned minimal profit for years while reinvesting everything — investors paid for future dominance, not current cash flows."},
      {q:"Growth stocks are often valued using:",options:["Dividend discount models","Book value per share","Price-to-earnings on projected future earnings — or Price-to-Sales when earnings are minimal","Current year earnings alone"],answer:2,explanation:"Growth stocks often trade at high multiples of current earnings because investors are paying for rapid future growth. Forward P/E or Price-to-Sales is commonly used when current profits are small relative to potential."},
      {q:"When interest rates rise sharply, growth stocks tend to underperform because:",options:["Their dividends fall","Their future earnings are worth less when discounted at a higher rate","Growth companies borrow more than value companies","They are not included in major indices"],answer:1,explanation:"Growth stocks derive most of their value from earnings far in the future. A higher discount rate reduces the present value of those distant cash flows — compressing the multiple investors are willing to pay. This is why tech stocks fell sharply during 2022's rate hikes."}
    ]},

  { id:44, tier:'gold', title:"Value Stocks (Deep Dive)",
    unit:"Reading Companies", blurb:"Finding the market's overlooked bargains.", icon:"valuation",
    questions:[
      {q:"Value investing, as popularised by Benjamin Graham and Warren Buffett, involves:",options:["Buying the most popular stocks","Buying stocks trading below their estimated intrinsic value to build in a 'margin of safety'","Focusing on fast-growing companies","Tracking market indices"],answer:1,explanation:"Value investors search for companies the market has underpriced — due to temporary problems, neglect, or pessimism. The goal is to buy $1 of value for $0.70, then wait for the market to recognise it."},
      {q:"The 'margin of safety' in value investing means:",options:["Using stop-loss orders on every position","Only buying when the estimated intrinsic value significantly exceeds the current price — creating a buffer against errors","Investing only in government bonds","Hedging every stock position with puts"],answer:1,explanation:"No valuation is perfectly accurate. The margin of safety gives you room to be wrong. If a stock is worth $100 and you buy at $60, the business could disappoint somewhat and you'd still make money."},
      {q:"Value stocks are most likely to outperform growth stocks during:",options:["Low interest rate environments and tech booms","Early stages of a speculative market run","Periods of rising interest rates and economic recovery","Bull markets driven by momentum and sentiment"],answer:2,explanation:"Rising rates hurt growth stocks (future earnings discounted more heavily) while value stocks, with earnings today, are less rate-sensitive. Economic recoveries also benefit undervalued cyclical businesses that value strategies tend to own."}
    ]},

  { id:45, tier:'gold', title:"Index vs Active Returns",
    unit:"Reading Companies", blurb:"The evidence on passive vs active investing.", icon:"etf",
    questions:[
      {q:"Over a typical 15-year period, what percentage of large-cap active fund managers in the US underperform their benchmark index?",options:["Around 20%","Around 40%","Around 60%","Over 85%"],answer:3,explanation:"The S&P SPIVA report consistently shows that over 85–90% of active large-cap US managers underperform the S&P 500 over 15-year periods — especially after fees. The odds of picking a consistent outperformer are poor."},
      {q:"The primary reason active funds underperform after fees is:",options:["Fund managers are incompetent","Markets are largely efficient, and management costs are subtracted from returns — making it hard to sustainably beat the index net of expenses","Index funds manipulate markets","Active funds hold too many stocks"],answer:1,explanation:"In competitive markets, prices reflect available information quickly. Even if a manager has skill, their fees (often 0.75–1.5%+ annually) create a persistent performance hurdle. Index funds at 0.03–0.10% start with a massive cost advantage."},
      {q:"Passive index investing works best as a strategy when:",options:["Markets are highly inefficient","You have a short time horizon and need capital quickly","You accept market returns, minimise costs, and stay invested through volatility","You have deep expertise in a specific sector"],answer:2,explanation:"Index investing wins through cost minimisation and time in the market. Long-term investors who stay invested through downturns, and don't need to beat the market in any given year, are the primary beneficiaries of passive strategies."}
    ]},


// ════════════════════════════════════════════════════════════
// UNIT 4 — Wall Street & Deals (lessons 46–65, gold)
// ════════════════════════════════════════════════════════════

  { id:46, tier:'gold', title:"Capital Structure",
    unit:"Wall Street & Deals", blurb:"How a company funds itself — and why it matters.", icon:"ebitda",
    questions:[
      {q:"A company's capital structure refers to:",options:["Its physical office footprint","The mix of equity and debt used to finance its assets and operations","Its shareholder register","Its revenue split by product"],answer:1,explanation:"Capital structure is the composition of a company's funding — typically a blend of shareholder equity, long-term debt, and other liabilities, each with different costs and risks."},
      {q:"The Modigliani-Miller theorem (in its simplest form) states that:",options:["Capital structure always matters","In perfect markets with no taxes or distress costs, capital structure is irrelevant to firm value","Only equity should be used","Debt is always optimal"],answer:1,explanation:"MM's theoretical baseline is that in frictionless markets, value comes from assets — not how they're financed. Real-world modifications (taxes, distress costs) explain why structure matters in practice."},
      {q:"A company optimises capital structure by:",options:["Maximising equity at all times","Balancing the tax benefits of debt against the increasing risk of financial distress as leverage rises","Using no debt","Matching a competitor's exact structure"],answer:1,explanation:"The trade-off theory: add debt to capture the tax shield, but not so much that the risk of distress (and its costs) outweighs the benefit. The optimal point varies by company and industry."}
    ]},

  { id:47, tier:'gold', title:"Debt Financing",
    unit:"Wall Street & Deals", blurb:"Borrowing money to grow a business.", icon:"bond",
    questions:[
      {q:"A key advantage of debt financing over equity is:",options:["Debt doesn't need to be repaid","Interest payments are tax-deductible, and existing shareholders are not diluted","Debt has no risk","Debt is always cheaper regardless of conditions"],answer:1,explanation:"The tax shield (interest expense reduces taxable income) makes debt cheaper than its headline rate. And since no new shares are issued, ownership isn't diluted."},
      {q:"The main risk of excessive debt is:",options:["Stock price appreciation","Financial distress or bankruptcy if cash flows can't cover debt obligations","Dilution of existing shareholders","Reduced tax obligations"],answer:1,explanation:"High leverage amplifies both gains and losses. If revenues decline unexpectedly, a heavily indebted company may struggle to service its debt — risking default."},
      {q:"A company's debt-to-equity ratio measures:",options:["How much equity it has relative to its size","How much it has borrowed relative to shareholder equity — a measure of financial leverage","Its profitability","Its asset base"],answer:1,explanation:"D/E ratio = Total Debt ÷ Total Equity. A ratio of 2.0 means the company has $2 of debt for every $1 of equity — moderate to high leverage depending on the industry."}
    ]},

  { id:48, tier:'gold', title:"Equity Financing",
    unit:"Wall Street & Deals", blurb:"Raising money by selling ownership.", icon:"ipo",
    questions:[
      {q:"Equity financing means raising capital by:",options:["Borrowing from banks","Issuing new shares and selling ownership stakes to investors","Issuing bonds","Retaining earnings only"],answer:1,explanation:"Equity financing brings in capital in exchange for ownership — no repayment obligation, but investors share in future profits and have a claim on assets."},
      {q:"One key disadvantage of equity financing is:",options:["Interest expense rises","Existing shareholders are diluted — ownership is spread over more shares","The company must repay investors","Dividends are tax-deductible"],answer:1,explanation:"Issuing new shares dilutes existing shareholders' ownership percentage. If the company grows well, this may be fine — but in the short term it reduces each shareholder's slice."},
      {q:"A rights issue allows:",options:["Only new investors to buy shares","Existing shareholders to buy new shares at a discount before they are offered publicly","The company to buy back its own shares","The government to invest"],answer:1,explanation:"A rights issue gives existing shareholders the right (but not obligation) to purchase new shares at a discounted price — protecting them from immediate dilution if they participate."}
    ]},

  { id:49, tier:'gold', title:"Dilution",
    unit:"Wall Street & Deals", blurb:"When your ownership percentage shrinks.", icon:"stock",
    questions:[
      {q:"Share dilution occurs when:",options:["A company buys back its shares","A company issues new shares, reducing existing shareholders' percentage ownership","A company pays a dividend","A company splits its stock"],answer:1,explanation:"When new shares are issued — for acquisitions, employee stock options, or fundraising — the total share count rises. Existing shareholders own a smaller slice of the same pie."},
      {q:"Dilution is most concerning when:",options:["The company uses proceeds productively to generate returns exceeding the dilution cost","New shares are issued but no value-accretive activity results — existing shareholders pay without benefit","The stock price rises after issuance","Options vest for key executives"],answer:1,explanation:"Dilution isn't always bad — if a company raises capital to invest at 20% returns, the dilution may be worth it. It's problematic when share issuance destroys value."},
      {q:"Anti-dilution provisions protect:",options:["Employees","Early investors in private companies from having their ownership percentage reduced by later fundraising rounds","Public shareholders from buybacks","Bond holders"],answer:1,explanation:"In venture and PE deals, early investors often have anti-dilution protection — ensuring that if new shares are issued at a lower price, their economics are protected from unfavourable dilution."}
    ]},

  { id:50, tier:'gold', title:"Convertible Bonds",
    unit:"Wall Street & Deals", blurb:"Debt that can become equity.", icon:"bond",
    questions:[
      {q:"A convertible bond is:",options:["A bond with a variable interest rate","A bond that can be converted into company shares at a specified price","A bond backed by government","A zero-coupon bond"],answer:1,explanation:"Convertible bonds are hybrid instruments — they start as debt (paying interest) but give the holder the option to convert into equity at a predetermined conversion price."},
      {q:"Investors typically accept lower coupon rates on convertibles because:",options:["They are riskier than regular bonds","They have embedded equity upside — if the stock rises above the conversion price, investors benefit from the appreciation","They have no credit risk","The company guarantees conversion"],answer:1,explanation:"The conversion option has value. Investors give up some yield in exchange for the potential to participate in equity upside if the company performs well."},
      {q:"For the issuing company, convertibles allow:",options:["Avoiding all dilution","Raising capital at a lower interest rate, with potential dilution only if the stock performs well enough for conversion","Paying higher dividends","Bypassing SEC regulations"],answer:1,explanation:"Companies issue converts to access cheaper debt. Dilution only occurs if shareholders are happy (the stock rose) — a preferred outcome versus dilutive equity issuance when the stock is low."}
    ]},

  { id:51, tier:'gold', title:"M&A",
    unit:"Wall Street & Deals", blurb:"How companies buy and merge with each other.", icon:"ipo",
    questions:[
      {q:"In an acquisition, the 'acquirer' is:",options:["The company being bought","The company doing the buying","The investment bank advising both sides","The regulatory body approving the deal"],answer:1,explanation:"The acquirer is the buyer — the company making the offer to purchase another business. The target is the company being acquired."},
      {q:"A 'hostile takeover' occurs when:",options:["The target company agrees to be acquired","The acquirer pursues the target without management's approval, going directly to shareholders","Both companies merge as equals","Regulatory bodies force a merger"],answer:1,explanation:"Hostile takeovers bypass management — the acquirer makes a tender offer directly to shareholders or acquires shares on the open market, ignoring the target board's opposition."},
      {q:"Deal consideration in M&A can be structured as:",options:["Cash only","Stock only","Cash, stock, or a combination of both","Only debt"],answer:2,explanation:"The acquirer can pay target shareholders in cash, issue new shares (stock consideration), or offer a mix. Each has different implications for taxes, dilution, and deal certainty."}
    ]},

  { id:52, tier:'gold', title:"Synergies",
    unit:"Wall Street & Deals", blurb:"Why 1 + 1 can equal more than 2 in M&A.", icon:"ebitda",
    questions:[
      {q:"Synergies in M&A refer to:",options:["The fees paid to investment bankers","The additional value created when two companies combine — the combined entity is worth more than the sum of parts","The regulatory approval process","A type of earn-out payment"],answer:1,explanation:"Synergies are the value-creation rationale for mergers — revenue synergies (cross-selling, new markets) and cost synergies (eliminated duplicates, scale economies)."},
      {q:"Cost synergies typically come from:",options:["Developing new products together","Eliminating redundant headcount, facilities, and overlapping functions","Charging customers higher prices","Increasing R&D spending"],answer:1,explanation:"Cost synergies are about efficiency: merged companies often share corporate HQ, IT systems, procurement, and HR — cutting overlapping costs significantly."},
      {q:"Why do analysts often say 'synergies are frequently overstated'?",options:["Synergies never occur","Integration is difficult, cultural clashes happen, and projected savings often take longer or cost more to achieve than modeled","Synergies are only relevant in hostile deals","Accounting rules prevent synergy recognition"],answer:1,explanation:"Research shows a majority of M&A deals destroy shareholder value, at least initially. Acquirers often overpay, integration is messier than planned, and projected synergies don't fully materialise."}
    ]},

  { id:53, tier:'gold', title:"Accretion vs Dilution (in Deals)",
    unit:"Wall Street & Deals", blurb:"Does this acquisition make each share worth more?", icon:"valuation",
    questions:[
      {q:"An acquisition is 'accretive' to earnings per share when:",options:["The deal reduces the acquirer's total shares outstanding","The earnings added from the target — relative to the price paid — increase the combined company's EPS above the acquirer's standalone EPS","The target company is larger than the acquirer","The deal is financed entirely with cash"],answer:1,explanation:"Accretion means the deal makes each existing share worth more in earnings terms. If you buy a high-earnings company cheaply enough, the blended EPS rises. Investment bankers always model this — investors expect accretive deals."},
      {q:"A deal is dilutive to EPS when:",options:["The acquirer uses too much debt","The earnings contribution of the acquired company is insufficient relative to its price — the combined EPS falls below the acquirer's standalone figure","The target has negative revenues","The regulatory approval takes too long"],answer:1,explanation:"Dilution occurs when the acquirer overpays in EPS terms. If you issue new stock to buy a company with minimal earnings, each existing share now represents a smaller slice of a barely-more-profitable combined entity. EPS falls."},
      {q:"The primary driver of whether a stock-for-stock merger is accretive or dilutive is:",options:["The absolute size of both companies","The relative P/E ratios — if the acquirer's P/E is higher than the target's, the deal tends to be accretive","The cash held on both balance sheets","The number of employees combined"],answer:1,explanation:"If the acquirer trades at 25x earnings and buys a company at 15x earnings, it issues 'expensive' currency to buy 'cheap' earnings — accretive. The reverse (buying high P/E targets with low P/E acquirer stock) tends to be dilutive."}
    ]},

  { id:54, tier:'gold', title:"Leveraged Buyout (LBO)",
    unit:"Wall Street & Deals", blurb:"Buying companies with borrowed money.", icon:"ebitda",
    questions:[
      {q:"A leveraged buyout (LBO) primarily uses:",options:["Entirely equity capital","A mix of equity and significant debt to finance the acquisition","Government grants","The target's own cash only"],answer:1,explanation:"LBOs are structured with mostly debt (often 60–80%) and relatively little equity. The debt is repaid using the acquired company's cash flows."},
      {q:"The target company's cash flows are critical in an LBO because:",options:["They determine the IPO price","They must be strong enough to service the large debt load taken on","They are immediately paid to PE investors","They replace the equity used"],answer:1,explanation:"The entire LBO model depends on the company generating enough free cash flow to cover debt interest payments and principal repayments over the holding period."},
      {q:"PE firms typically exit an LBO by:",options:["Holding the company forever","Selling to a strategic buyer, another PE firm, or via IPO","Returning the company to its former owners","Liquidating assets"],answer:1,explanation:"Exit is critical to realising returns. The three main exit routes are strategic sale (to a corporation), secondary buyout (to another PE firm), or an IPO listing the shares publicly."}
    ]},

  { id:55, tier:'gold', title:"Private Equity",
    unit:"Wall Street & Deals", blurb:"Investing in companies not on the stock market.", icon:"ipo",
    questions:[
      {q:"Private equity (PE) firms primarily:",options:["Trade public company stocks","Invest capital in private companies, often acquiring them outright to improve and sell for a profit","Manage index funds","Issue government bonds"],answer:1,explanation:"PE firms raise money from institutional investors and wealthy individuals, acquire private (or take private) companies, work to improve them operationally, and sell them later at a profit."},
      {q:"A leveraged buyout (LBO) uses:",options:["Entirely the PE firm's own equity","A mix of equity and significant borrowed debt to acquire a company","Only the target company's cash","Government loans"],answer:1,explanation:"LBOs are the signature PE deal structure — using relatively small equity alongside large amounts of debt, amplifying returns (and risks) on the equity portion."},
      {q:"PE investments are illiquid because:",options:["They trade on a special exchange","Capital is locked in for several years — typically a 5–10 year fund lifecycle","They can be sold any time like public stocks","Dividends are paid monthly"],answer:1,explanation:"Private equity funds have a defined lifecycle — investors commit capital for years before the fund exits its investments. There's no market to sell your PE stake during that period."}
    ]},

  { id:56, tier:'gold', title:"Venture Capital",
    unit:"Wall Street & Deals", blurb:"Funding the companies of tomorrow.", icon:"ipo",
    questions:[
      {q:"Venture capital (VC) focuses on investing in:",options:["Mature public companies","Early-stage, high-growth startups in exchange for equity","Government bonds","Real estate development"],answer:1,explanation:"VCs fund startups and early-stage companies with high growth potential — accepting high risk in exchange for equity stakes that could become enormously valuable if the startup succeeds."},
      {q:"A VC's investment strategy typically accepts that:",options:["All portfolio companies will succeed","Most investments will fail, but a few big wins more than compensate the losses","Returns will be guaranteed","Startups are safer than public stocks"],answer:1,explanation:"VC is a power law business — the majority of investments may return little or nothing, but one or two breakout companies (Uber, Airbnb) generate returns that dwarf the losses."},
      {q:"A 'unicorn' in venture capital refers to:",options:["A VC fund with no losses","A privately held startup valued at over $1 billion","Any company that has gone public","A fund manager who beats the market every year"],answer:1,explanation:"The term 'unicorn' was coined by investor Aileen Lee to describe the rare private companies that reach a $1B+ valuation — a milestone that was once considered fantastically rare."}
    ]},

  { id:57, tier:'gold', title:"Hedge Funds",
    unit:"Wall Street & Deals", blurb:"The sophisticated vehicles for sophisticated investors.", icon:"risk",
    questions:[
      {q:"Hedge funds differ from mutual funds primarily because they:",options:["Invest only in bonds","Use complex strategies including shorting, leverage, and derivatives, and are only open to accredited investors","Are free to invest in","Are government-regulated to the same degree as ETFs"],answer:1,explanation:"Hedge funds are lightly regulated, use sophisticated strategies (long/short, macro, arbitrage), and are restricted to wealthy accredited investors due to their complexity and risk."},
      {q:"The typical hedge fund fee structure is described as:",options:["0.1% annual fee","2 and 20 — 2% management fee plus 20% of profits","A flat annual subscription","No fees — performance only"],answer:1,explanation:"'2 and 20' means investors pay 2% of assets annually plus 20% of any profits generated — far higher than traditional funds."},
      {q:"A 'long/short equity' hedge fund makes money by:",options:["Only buying undervalued stocks","Buying stocks expected to rise and short-selling stocks expected to fall, profiting from both directions","Only investing in commodities","Tracking an index with leverage"],answer:1,explanation:"Long/short funds hold long positions in expected outperformers and short positions in expected underperformers — aiming to profit regardless of overall market direction."}
    ]},

  { id:58, tier:'gold', title:"Financial Modelling Basics",
    unit:"Wall Street & Deals", blurb:"Building the spreadsheet behind every deal.", icon:"valuation",
    questions:[
      {q:"A financial model is primarily used to:",options:["Track employee expenses","Project a company's future financial performance and evaluate scenarios","Replace accounting statements","Calculate tax obligations"],answer:1,explanation:"Financial models forecast income statements, balance sheets, and cash flows — enabling valuation, deal analysis, and strategic decision-making."},
      {q:"The three core statements in a financial model are:",options:["Budget, forecast, and actuals","Income statement, balance sheet, and cash flow statement","Profit, revenue, and EBITDA","Sales forecast, payroll, and capex"],answer:1,explanation:"The income statement shows profitability, the balance sheet shows financial position, and the cash flow statement shows cash movements. They interconnect — changes in one flow through to the others."},
      {q:"Sensitivity analysis in a model tests:",options:["Accounting accuracy","How changes in key assumptions (growth rate, margin) affect the output — typically valuation","Regulatory compliance","Employee headcount scenarios"],answer:1,explanation:"No model assumption is certain. Sensitivity tables show how the conclusion (e.g. implied value) changes as you move key inputs — revealing which assumptions drive the result most."}
    ]},

  { id:59, tier:'gold', title:"Investment Banking Overview",
    unit:"Wall Street & Deals", blurb:"The deal-makers behind global finance.", icon:"ipo",
    questions:[
      {q:"Investment banks primarily do which of the following?",options:["Manage retail savings accounts","Advise on M&A, help companies raise capital, and facilitate large securities transactions","Set monetary policy","Provide consumer mortgages"],answer:1,explanation:"Investment banks connect companies needing capital (or strategic advice) with investors. Key activities: underwriting equity/debt offerings, M&A advisory, and trading."},
      {q:"The 'bulge bracket' refers to:",options:["Mid-market boutique advisory firms","The largest global investment banks — Goldman Sachs, Morgan Stanley, JPMorgan, etc.","Boutique restructuring advisors","Regional commercial banks"],answer:1,explanation:"Bulge bracket banks are the top tier — massive institutions with global presence, handling the largest deals and offering the full range of investment banking services."},
      {q:"A 'sell-side' analyst works for:",options:["A hedge fund that trades based on their research","An investment bank or brokerage, producing research distributed to buy-side investors","A company being acquired","A regulatory body"],answer:1,explanation:"Sell-side analysts at banks publish research (buy/sell/hold recommendations) that clients (buy-side institutions like funds) use to inform their own investment decisions."}
    ]},

  { id:60, tier:'gold', title:"IPO Process (Deep Dive)",
    unit:"Wall Street & Deals", blurb:"How a private company becomes public, step by step.", icon:"ipo",
    questions:[
      {q:"The first major step in a company's IPO process is typically:",options:["Setting the share price","Choosing investment bank underwriters and filing an S-1 registration statement with the SEC","Listing on the stock exchange","Conducting a roadshow to retail investors"],answer:1,explanation:"The company hires underwriting banks, prepares its S-1 filing detailing financials, business model, and risks, and submits it to the SEC for review. The S-1 becomes the public prospectus."},
      {q:"The 'roadshow' in an IPO refers to:",options:["The final day of trading before listing","A series of presentations to institutional investors to build the order book before shares are priced","The process of registering with stock exchanges","Marketing the shares only to retail investors"],answer:1,explanation:"Management teams and bankers spend 1–2 weeks meeting institutional investors (fund managers, hedge funds) to pitch the company. These meetings determine demand, which feeds into the final pricing of the shares."},
      {q:"A large IPO 'pop' on day one — where shares surge above the offer price — generally means:",options:["The IPO was perfectly priced","The company and its bankers underpriced the shares — leaving money on the table that could have gone to the company","The company is overvalued","Retail investors drove the price up artificially"],answer:1,explanation:"A big first-day pop is exciting for investors who got allocations, but it means the company sold shares too cheaply. If the stock opens 30% above the IPO price, the company raised 30% less than it could have."}
    ]},

  { id:61, tier:'gold', title:"NASDAQ",
    unit:"Wall Street & Deals", blurb:"The home of technology and growth.", icon:"stock",
    questions:[
      {q:"NASDAQ is primarily known for listing:",options:["Energy companies","Technology and growth companies — Apple, Microsoft, Amazon, Meta, Alphabet","Financial institutions","Government agencies"],answer:1,explanation:"NASDAQ became the go-to exchange for tech IPOs in the 1990s. Today it's home to most of the world's largest technology companies."},
      {q:"The NASDAQ Composite index includes:",options:["Only 100 stocks","All stocks listed on the NASDAQ exchange — over 3,000 companies","Only US companies","The same companies as the S&P 500"],answer:1,explanation:"The NASDAQ Composite covers all stocks on the exchange. The more commonly cited NASDAQ-100 tracks the 100 largest non-financial companies on NASDAQ."},
      {q:"The NASDAQ declined roughly 75% from peak to trough during the 2000–2002 dot-com bust because:",options:["Interest rates were too low","Many listed companies had little revenue but extreme valuations, and the bubble in tech speculation collapsed","The Fed raised rates unexpectedly","All financial stocks listed there"],answer:1,explanation:"Dot-com era companies had astronomical valuations with minimal fundamentals. When growth failed to materialise and capital dried up, the tech-heavy NASDAQ suffered catastrophically."}
    ]},

  { id:62, tier:'gold', title:"Market Makers",
    unit:"Wall Street & Deals", blurb:"Who provides liquidity in every market?", icon:"valuation",
    questions:[
      {q:"A market maker's primary function is:",options:["Enforcing trading regulations","Continuously quoting buy (bid) and sell (ask) prices to provide liquidity to the market","Advising companies on M&A","Setting interest rates"],answer:1,explanation:"Market makers stand ready to buy and sell at all times — ensuring there's always a counterparty for your trade. Without them, markets would be far less liquid and spreads would be enormous."},
      {q:"Market makers profit primarily from:",options:["Capital appreciation of stocks they hold","The bid-ask spread — buying at the bid and selling at the ask repeatedly across thousands of transactions","Dividend income","Management fees"],answer:1,explanation:"Capturing the spread on millions of trades is the market maker's edge. Each individual spread is tiny, but at high volume and low risk, it's a consistent and substantial revenue source."},
      {q:"High-frequency trading firms act as electronic market makers by:",options:["Placing large long-term bets on market direction","Using algorithms to quote tight bid-ask spreads at microsecond speed, profiting from tiny spreads at enormous scale","Executing block trades manually","Managing pension fund assets"],answer:1,explanation:"HFT firms have effectively replaced human floor traders as market makers on most exchanges — using speed and technology to provide tighter spreads and deeper liquidity."}
    ]},

  { id:63, tier:'gold', title:"Short Selling",
    unit:"Wall Street & Deals", blurb:"Betting against a company — and why it matters.", icon:"risk",
    questions:[
      {q:"Why do short sellers perform a valuable market function?",options:["They reduce trading volumes","They help identify overvalued stocks and incorporate negative information into prices faster","They guarantee price stability","They eliminate all market risk"],answer:1,explanation:"Short sellers do the uncomfortable work of finding fraud, overvaluation, and deteriorating fundamentals — bringing prices closer to reality and improving market efficiency."},
      {q:"A 'short squeeze' occurs when:",options:["A shorted stock falls sharply","A heavily shorted stock rises sharply, forcing short-sellers to buy back shares to limit losses — pushing the price even higher","Interest rates on margin rise","A company buys back shares"],answer:1,explanation:"If a shorted stock rises, shorts must repurchase to cut losses. That forced buying drives the price higher, triggering even more short covering in a self-reinforcing cycle. GameStop (2021) is a famous example."},
      {q:"Short sellers are required to pay the lender:",options:["The full stock price","Any dividends paid on the borrowed shares during the holding period","The original short price minus the current price","Nothing until they close the position"],answer:1,explanation:"When you borrow shares, you're legally obligated to return them — including any dividends declared while you held them. Shorting around ex-dividend dates carries additional cost implications."}
    ]},

  { id:64, tier:'gold', title:"Long vs Short Positions",
    unit:"Wall Street & Deals", blurb:"Profiting whether the market goes up or down.", icon:"options",
    questions:[
      {q:"Going 'long' on a stock means:",options:["Borrowing shares to sell","Buying shares with the expectation that the price will rise","Selling shares you already own","Hedging with options"],answer:1,explanation:"A long position is the standard: you buy an asset expecting it to increase in value. Your profit equals (sell price − buy price) × shares held."},
      {q:"Going 'short' on a stock means:",options:["Holding shares for a short time","Borrowing shares, selling them immediately, and hoping to buy them back later at a lower price","Buying shares at market open","Holding only bonds"],answer:1,explanation:"Short selling reverses the normal order: you borrow shares and sell them first, then buy them back (ideally at a lower price) to return to the lender. Profit = original sale price − repurchase price."},
      {q:"The maximum loss on a short position is theoretically:",options:["Limited to the amount invested","Unlimited, because the stock price can rise indefinitely","The bid-ask spread","The broker's commission"],answer:1,explanation:"A long position loses a maximum of 100% (stock goes to zero). A short can lose infinitely — if you short at $50 and the stock rises to $500, you lose $450 per share with no cap."}
    ]},

  { id:65, tier:'gold', title:"Stock Dilution",
    unit:"Wall Street & Deals", blurb:"How share issuance affects your ownership.", icon:"stock",
    questions:[
      {q:"When a public company issues stock to pay for an acquisition, existing shareholders experience:",options:["No change to their ownership","Dilution — their percentage of the company decreases as new shares are issued to the target's shareholders","Automatic dividend compensation","An increase in EPS"],answer:1,explanation:"Stock-for-stock mergers create dilution for the acquirer's existing shareholders. New shares issued reduce each existing shareholder's percentage ownership — which is why bankers always model the accretion/dilution impact."},
      {q:"Stock-based compensation (SBC) causes dilution because:",options:["It reduces the company's cash position","Employees receive shares or options, which when exercised add to the total share count and reduce each existing share's percentage","It increases operating expenses","It requires repayment like a loan"],answer:1,explanation:"SBC is effectively a cost paid in ownership rather than cash. When options vest and are exercised, new shares are issued, diluting existing holders. This is why diluted EPS (including all potential option exercises) is the standard reported figure."},
      {q:"A company can offset the dilutive impact of stock-based compensation by:",options:["Paying higher dividends","Conducting share buybacks to reduce the total share count, neutralising the increase from option exercises","Issuing convertible bonds","Increasing its dividend yield"],answer:1,explanation:"Many mature tech companies run large buyback programs specifically to offset SBC dilution. Apple, Alphabet, and Microsoft regularly repurchase billions in stock to prevent share count from creeping up over time."}
    ]},


// ════════════════════════════════════════════════════════════
// UNIT 5 — Trading & Derivatives (lessons 66–82, platinum)
// ════════════════════════════════════════════════════════════

  { id:66, tier:'platinum', title:"Options Basics",
    unit:"Trading & Derivatives", blurb:"Calls, puts, and how options work.", icon:"options",
    questions:[
      {q:"A call option gives the holder the right to:",options:["Buy a stock at the strike price","Sell a stock at the strike price","Receive dividends automatically","Borrow shares"],answer:0,explanation:"A call gives you the right (not obligation) to BUY shares at the predetermined strike price."},
      {q:"A put option is associated with the right to:",options:["Sell a stock at the strike price","Buy a stock at the strike price","Issue new shares","Collect bond coupons"],answer:0,explanation:"A put gives you the right to SELL shares at the strike price — useful as insurance against a stock dropping."},
      {q:"The price paid to buy an option is called:",options:["The strike","The premium","The dividend","The spread"],answer:1,explanation:"The premium is the market price of the option contract — what you pay upfront for the right it conveys."},
      {q:"Options have time value because:",options:["More time means more chance of a favorable move","Time reduces risk","Longer options are free","Exchanges charge time fees"],answer:0,explanation:"Longer-dated options cost more — more time for the underlying stock to make a favorable move."}
    ]},

  { id:67, tier:'platinum', title:"Call Options",
    unit:"Trading & Derivatives", blurb:"The right to buy — explored in full.", icon:"options",
    questions:[
      {q:"A call option is 'in the money' (ITM) when:",options:["The stock price is below the strike price","The stock price is above the strike price","The option is about to expire","The premium has doubled"],answer:1,explanation:"A call is ITM when it has intrinsic value — the stock trades above the strike price, meaning you could exercise now and immediately profit from the difference."},
      {q:"A naked call seller's risk is:",options:["Limited to the premium received","Theoretically unlimited because the underlying can rise without limit","Limited to 100% of shares","Zero — they already received the premium"],answer:1,explanation:"Selling a call without owning the underlying (naked) is extremely risky. If the stock rockets, you must deliver shares at the strike price, buying at market — losses are unbounded."},
      {q:"If you buy a call with a $50 strike for a $3 premium and the stock rises to $60, your profit at expiration is:",options:["$10 per share","$7 per share ($10 intrinsic value − $3 premium paid)","$3 per share","$60 per share"],answer:1,explanation:"Intrinsic value at $60: $60 − $50 = $10. Net profit: $10 − $3 premium = $7 per share (per contract: × 100 shares)."}
    ]},

  { id:68, tier:'platinum', title:"Put Options",
    unit:"Trading & Derivatives", blurb:"The right to sell — protective and speculative.", icon:"options",
    questions:[
      {q:"A put option is 'in the money' (ITM) when:",options:["The stock price is above the strike price","The stock price is below the strike price","The option has just been purchased","Implied volatility is rising"],answer:1,explanation:"A put has intrinsic value when the stock trades below the strike — you have the right to sell at a higher price than market, which has real value."},
      {q:"Buying put options on your existing stock portfolio is:",options:["Speculative and increases risk","A hedging strategy — the puts gain value if your stocks fall, partially offsetting losses","Equivalent to selling your stocks","Only available to institutional investors"],answer:1,explanation:"Protective puts are portfolio insurance. You pay a premium for the right to sell at a floor price — guaranteeing a minimum value for your shares if the market crashes."},
      {q:"If you buy a $40 strike put for $2 on a stock at $45, and the stock falls to $32:",options:["You lose the $2 premium","Your put expires worthless","Your profit is $6 per share ($40 − $32 − $2 premium)","Your profit is $8 per share"],answer:2,explanation:"Put value at expiry: $40 − $32 = $8 intrinsic value. Minus $2 premium paid = $6 net profit per share."}
    ]},

  { id:69, tier:'platinum', title:"Strike Price",
    unit:"Trading & Derivatives", blurb:"The price that makes options valuable.", icon:"options",
    questions:[
      {q:"The strike price of an option is:",options:["The current market price of the stock","The predetermined price at which the option can be exercised","The premium paid for the option","The break-even price"],answer:1,explanation:"The strike (or exercise) price is fixed at the time the option is written. For a call, it's the price you can buy at; for a put, the price you can sell at — regardless of where the stock trades."},
      {q:"An option is 'at the money' (ATM) when:",options:["You have lost 100% of the premium","The stock price is equal or very close to the strike price","The option has maximum intrinsic value","The option expires tomorrow"],answer:1,explanation:"ATM options have no intrinsic value but maximum time value — the outcome is uncertain in either direction. ATM options are the most commonly traded on the options market."},
      {q:"Choosing a strike price for a call option involves:",options:["Always picking the lowest available strike","Balancing the cost (premium) against the probability of the stock reaching that level — a tradeoff between cost and upside","Using the current stock price only","Setting it equal to your portfolio value"],answer:1,explanation:"Deep ITM calls are expensive but have high intrinsic value. Deep OTM calls are cheap but unlikely to expire profitably. The chosen strike reflects your outlook, risk tolerance, and desired leverage."}
    ]},

  { id:70, tier:'platinum', title:"Expiration Date",
    unit:"Trading & Derivatives", blurb:"Why time is always running out for options.", icon:"options",
    questions:[
      {q:"The expiration date of an option is:",options:["The date you purchased it","The last day the option can be exercised","The settlement date for the underlying stock","When the premium is paid"],answer:1,explanation:"Options have a defined lifespan. On or before expiration, the holder must either exercise, sell the option, or let it expire worthless. American-style options can be exercised any time; European only at expiry."},
      {q:"An option that is out of the money at expiration:",options:["Is automatically exercised","Retains its premium value","Expires worthless — the holder loses the entire premium paid","Is automatically renewed"],answer:2,explanation:"If a call is below the strike (or a put above the strike) at expiry, there's no value in exercising. The option expires worthless and the premium is lost — the maximum possible loss for the buyer."},
      {q:"'Theta decay' refers to:",options:["The rate at which an option gains value","The rate at which an option loses value as expiration approaches","The relationship between volatility and premium","The delta of a short option"],answer:1,explanation:"Time value erodes as an option nears expiration — uncertainty decreases the closer you are to the known outcome date. Option sellers profit from theta decay; buyers are hurt by it."}
    ]},

  { id:71, tier:'platinum', title:"Intrinsic vs Time Value",
    unit:"Trading & Derivatives", blurb:"The two components of every option price.", icon:"options",
    questions:[
      {q:"The intrinsic value of an option is:",options:["The total premium","The amount by which the option is currently in the money","The time remaining until expiration","The implied volatility component"],answer:1,explanation:"Intrinsic value is concrete and immediate — it's the profit you'd make if you exercised right now. A $50 call when the stock is at $55 has $5 of intrinsic value."},
      {q:"Time value (extrinsic value) represents:",options:["The intrinsic value only","The additional premium above intrinsic value — the market's estimate of the option's potential to gain more value before expiry","The commission paid","The dividend yield of the stock"],answer:1,explanation:"Time value is the 'hope premium' — the possibility the stock moves further in-the-money before expiration. ATM options have maximum time value; deep ITM/OTM have less."},
      {q:"As expiration approaches, the time value of an option:",options:["Increases","Decreases to zero — only intrinsic value remains at expiry","Stays constant","Becomes equal to intrinsic value"],answer:1,explanation:"Time value decays to zero at expiration. The deeper the option is ITM, the smaller the remaining time value component relative to intrinsic."}
    ]},

  { id:72, tier:'platinum', title:"Implied Volatility",
    unit:"Trading & Derivatives", blurb:"What options reveal about market expectations.", icon:"risk",
    questions:[
      {q:"Implied volatility (IV) is derived from:",options:["Historical price data","The current market price of an option, reflecting the market's forecast of future volatility","The underlying stock's earnings","The VIX index directly"],answer:1,explanation:"IV is 'backed out' of the option's market price using an options pricing model (like Black-Scholes). If the option is expensive, IV is high — the market expects big moves."},
      {q:"When implied volatility rises, option prices:",options:["Fall","Rise — higher expected volatility means more potential for profitable moves, increasing the option's value","Stay the same","Double in all cases"],answer:1,explanation:"Volatility is the most important input into option value beyond intrinsic value. Higher IV = higher premiums for both calls and puts. This is why options get expensive before major events."},
      {q:"'Selling volatility' strategies profit when:",options:["Markets are extremely volatile","Implied volatility is high and then falls — the option premium received exceeds the actual move","The underlying stock rises","Interest rates fall"],answer:1,explanation:"When IV is elevated (before earnings, elections), option sellers can collect rich premiums. If the actual subsequent move is smaller than what IV implied, time decay and IV collapse work in the seller's favour."}
    ]},

  { id:73, tier:'platinum', title:"The Greeks Overview",
    unit:"Trading & Derivatives", blurb:"The sensitivities that govern option behaviour.", icon:"options",
    questions:[
      {q:"The 'Greeks' in options trading measure:",options:["The geographic origin of option contracts","How an option's price is expected to change in response to various inputs","The historical returns of options strategies","The creditworthiness of option sellers"],answer:1,explanation:"The Greeks quantify how sensitive an option's price is to changes in key variables: underlying price (delta, gamma), time (theta), volatility (vega), and interest rates (rho)."},
      {q:"Which Greek measures the sensitivity of an option's price to a $1 change in the underlying stock?",options:["Theta","Gamma","Delta","Vega"],answer:2,explanation:"Delta ranges from 0 to 1 (calls) or −1 to 0 (puts). A delta of 0.5 means the option price moves approximately $0.50 for every $1 move in the stock."},
      {q:"Understanding the Greeks is most important for:",options:["Buy-and-hold stock investors","Options traders who need to manage risk precisely and understand how their position will behave","Bond investors","Day traders of individual stocks"],answer:1,explanation:"The Greeks allow options traders to assess and manage multidimensional risk — not just directional exposure but sensitivity to time, volatility, and rate changes simultaneously."}
    ]},

  { id:74, tier:'platinum', title:"Delta",
    unit:"Trading & Derivatives", blurb:"How much does the option move with the stock?", icon:"options",
    questions:[
      {q:"A call option with a delta of 0.60 will approximately:",options:["Expire worthless 60% of the time","Increase in value by $0.60 for every $1 rise in the underlying stock","Have a 60% chance of expiring in the money","Trade at 60% of the stock price"],answer:1,explanation:"Delta is the rate of change of option price relative to underlying price. Delta 0.60 means: stock up $1, option up ~$0.60. It's also roughly the probability of expiring ITM."},
      {q:"Deep in-the-money call options typically have a delta close to:",options:["0","−1","1.0","0.5"],answer:2,explanation:"A deep ITM call moves nearly dollar-for-dollar with the stock — almost equivalent to owning the stock itself. Delta approaches 1 for deep ITM calls."},
      {q:"'Delta hedging' involves:",options:["Buying stocks with no options exposure","Continuously adjusting a position to maintain a net delta of zero — neutralising directional exposure","Only selling calls","Matching dividends to delta"],answer:1,explanation:"Market makers and sophisticated traders delta-hedge to isolate other exposures (like volatility) from directional risk. As prices move, delta changes and the hedge must be adjusted."}
    ]},

  { id:75, tier:'platinum', title:"Gamma",
    unit:"Trading & Derivatives", blurb:"The rate of change of delta itself.", icon:"options",
    questions:[
      {q:"Gamma measures:",options:["An option's price sensitivity to volatility","The rate of change of delta — how quickly delta changes as the underlying moves","Time decay of an option","An option's sensitivity to interest rates"],answer:1,explanation:"Gamma is the second-order risk — the derivative of delta. High gamma means your delta (and therefore your hedging needs) changes rapidly as the underlying moves."},
      {q:"ATM options tend to have:",options:["The lowest gamma","The highest gamma — small stock moves create the largest relative changes in delta","Zero gamma","Gamma equal to delta"],answer:1,explanation:"ATM options are on the cusp of intrinsic value. A small move changes whether they're ITM or OTM dramatically — hence delta is most sensitive to the underlying move, giving maximum gamma."},
      {q:"For an options seller (short options), high gamma is:",options:["Beneficial — it accelerates profit","Risky — sharp moves cause delta to change rapidly, potentially creating large losses the seller must hedge against","Irrelevant to their P&L","Only a concern if rates rise"],answer:1,explanation:"Short gamma means large moves hurt you — your delta exposure shifts quickly against you. This is why options sellers prefer calm markets and dislike sharp, sudden price swings."}
    ]},

  { id:76, tier:'platinum', title:"Theta",
    unit:"Trading & Derivatives", blurb:"How time slowly eats into option value.", icon:"options",
    questions:[
      {q:"Theta (time decay) represents:",options:["The speed at which options gain value","The daily erosion of an option's time value as expiration approaches","How much the option moves with the stock","Sensitivity to volatility changes"],answer:1,explanation:"Theta is expressed as the dollar amount an option loses per day all else being equal. An option with theta of −$0.05 loses approximately $0.05 of value each passing day."},
      {q:"Theta decay is fastest:",options:["Immediately after an option is purchased","In the final days and weeks before expiration — especially for ATM options","When the market is trending","When interest rates rise"],answer:1,explanation:"Time decay accelerates exponentially as expiration nears. A 90-day option loses time value slowly; in the last 2 weeks it erodes rapidly — the 'theta cliff'."},
      {q:"An options seller benefits from theta because:",options:["They pay theta daily","They receive the premium upfront and profit as the option they sold loses time value over time","Theta reduces their delta exposure","Theta increases volatility profits"],answer:1,explanation:"Option writers collect premium and watch it decay as expiration approaches. All else being equal, the passage of time works in the seller's favour — the option they sold is worth less each day."}
    ]},

  { id:77, tier:'platinum', title:"Vega",
    unit:"Trading & Derivatives", blurb:"How options react to changes in volatility.", icon:"options",
    questions:[
      {q:"Vega measures:",options:["An option's time decay","An option's sensitivity to a 1% change in implied volatility","An option's delta adjusted for gamma","The option's interest rate sensitivity"],answer:1,explanation:"Vega quantifies how much an option's price changes for every 1 percentage point change in implied volatility. A vega of 0.15 means IV up 1% → option up $0.15."},
      {q:"Long options (both calls and puts) have:",options:["Negative vega — they lose money when IV rises","Positive vega — they gain value when implied volatility rises","Zero vega — volatility doesn't affect premium","Vega that only applies to puts"],answer:1,explanation:"Options buyers want volatility — more uncertainty = more potential for the option to become valuable. Both calls and puts gain when IV rises. Sellers are the opposite (short vega)."},
      {q:"Before a major earnings release, implied volatility typically:",options:["Falls sharply","Rises as uncertainty peaks, then collapses immediately after the announcement — called a 'volatility crush'","Stays flat","Only affects put options"],answer:1,explanation:"Uncertainty before earnings inflates IV and option premiums. The moment results are announced, uncertainty resolves and IV collapses — often dramatically. Earnings option strategies must account for this."}
    ]},

  { id:78, tier:'platinum', title:"Hedging with Options",
    unit:"Trading & Derivatives", blurb:"Using derivatives to manage risk.", icon:"risk",
    questions:[
      {q:"Hedging in finance means:",options:["Maximising returns at any risk level","Taking an offsetting position to reduce or eliminate risk on an existing exposure","Diversifying across stocks only","Buying high and selling low"],answer:1,explanation:"A hedge is a risk-reduction trade. It may sacrifice some potential upside in exchange for limiting downside — like buying insurance on your portfolio."},
      {q:"A company with large euro revenues that reports in US dollars might hedge by:",options:["Buying euros on the spot market","Entering into forward contracts to sell euros at a fixed exchange rate — locking in a known dollar value","Ignoring currency risk","Issuing euro-denominated bonds"],answer:1,explanation:"Corporate FX hedging converts uncertain future currency receipts into known cash flows — reducing earnings volatility caused by exchange rate fluctuations."},
      {q:"A natural hedge occurs when:",options:["A company buys puts","Offsetting risks exist within the business itself without derivatives — e.g. a company with both USD revenues and USD costs has less FX risk","A company issues bonds","You diversify across 10 stocks"],answer:1,explanation:"Natural hedges arise from the business structure. If revenue and costs are in the same currency, movements offset each other — no derivatives needed."}
    ]},

  { id:79, tier:'platinum', title:"Margin Trading",
    unit:"Trading & Derivatives", blurb:"Borrowing from your broker to trade bigger.", icon:"risk",
    questions:[
      {q:"Trading on margin means:",options:["Only trading during market hours","Borrowing money from your broker to increase your position size beyond your own capital","Trading on the NYSE","Hedging with futures"],answer:1,explanation:"Margin allows you to control more capital than you have. If you have $10,000 and 2x leverage, you control $20,000 of securities — amplifying both gains and losses."},
      {q:"A margin call occurs when:",options:["You make a profit on a margin trade","Your account's equity falls below the broker's minimum maintenance requirement — you must deposit more cash or close positions","You successfully hedge a position","The Fed raises rates"],answer:1,explanation:"If leveraged positions move against you and your equity drops below maintenance margin (typically ~25%), your broker demands more capital immediately or will forcibly liquidate positions."},
      {q:"Using 2x leverage means your losses are:",options:["Halved","Doubled relative to unleveraged","The same","Limited to the initial deposit"],answer:1,explanation:"Leverage amplifies in both directions. A 10% adverse move with 2x leverage = 20% loss on your capital. A 50% adverse move wipes out your equity entirely."}
    ]},

  { id:80, tier:'platinum', title:"Stop Loss Orders",
    unit:"Trading & Derivatives", blurb:"Automating your exit to protect capital.", icon:"risk",
    questions:[
      {q:"A stop loss order automatically:",options:["Adds to a position when it is profitable","Sells (or covers a short) when the price reaches a predetermined level, limiting losses","Triggers when a profit target is hit","Buys additional shares on a dip"],answer:1,explanation:"A stop loss converts into a market order when triggered — it sells your position if the price falls to your specified level, preventing losses beyond a predefined threshold."},
      {q:"A key risk of stop loss orders is:",options:["They prevent all losses","In fast-moving or gapped markets, execution may occur significantly below the stop price (slippage)","They cost extra commissions","They require daily renewal"],answer:1,explanation:"Market orders execute at the next available price. If a stock gaps down through your stop level overnight, you may sell much lower than intended — this is called 'gapping through' your stop."},
      {q:"A trailing stop loss:",options:["Remains fixed at a specific price","Moves upward as the stock price rises, locking in more profit while still protecting against a reversal","Is only available on short positions","Requires manual adjustment"],answer:1,explanation:"A trailing stop follows the price upward automatically — if you set a 10% trailing stop, it rises with the price, always sitting 10% below the peak, crystallising gains if the stock reverses."}
    ]},

  { id:81, tier:'platinum', title:"Risk Management",
    unit:"Trading & Derivatives", blurb:"The discipline that separates pros from amateurs.", icon:"risk",
    questions:[
      {q:"Position sizing in trading refers to:",options:["The number of hours you trade","Determining how much capital to allocate to each trade relative to your total portfolio","Choosing the bid-ask spread","The leverage ratio"],answer:1,explanation:"Position sizing controls risk. Risking 1–2% of capital per trade means a string of losses won't be catastrophic. Oversized positions can wipe out accounts in a single bad trade."},
      {q:"The Kelly Criterion is used to:",options:["Calculate the tax on trading profits","Determine the optimal fraction of capital to bet on each trade to maximise long-run geometric growth","Set stop loss levels","Measure correlation between assets"],answer:1,explanation:"The Kelly formula optimises position size based on your edge and win probability. Trading the full Kelly or more risks ruin — most professionals use fractional Kelly (0.25x–0.5x)."},
      {q:"Drawdown in trading refers to:",options:["Withdrawing money from a trading account","The decline from a portfolio's peak value to its trough before a new high is reached","Daily trading commissions","Overnight funding costs"],answer:1,explanation:"Drawdown measures the peak-to-trough decline in portfolio value. A 50% drawdown requires a 100% gain just to recover to the previous high — illustrating why managing drawdown is critical."}
    ]},

  { id:82, tier:'platinum', title:"Trading Psychology",
    unit:"Trading & Derivatives", blurb:"Why emotions are the enemy of good trading.", icon:"risk",
    questions:[
      {q:"Loss aversion in trading means traders:",options:["Prefer bonds to stocks","Feel the pain of losses more intensely than the pleasure of equivalent gains — leading to irrational decisions","Always sell during downturns","Avoid all risk completely"],answer:1,explanation:"Psychologists Kahneman and Tversky found that losses hurt roughly twice as much as equivalent gains feel good. In trading, this causes behaviours like holding losers too long and cutting winners too short."},
      {q:"'Revenge trading' refers to:",options:["Trading stocks in competing sectors","Making impulsive, oversized trades immediately after a loss in an emotional attempt to win the money back","Following the crowd into popular positions","Copying another trader's strategy"],answer:1,explanation:"Revenge trading is driven by emotion, not analysis — it typically leads to larger losses. The professional response to a bad trade is to step back, not to double down with anger-fuelled impulsiveness."},
      {q:"Recency bias leads traders to:",options:["Over-invest in bonds","Assume that recent performance (up or down) will continue indefinitely — chasing winners and avoiding recent losers","Ignore macroeconomic trends","Diversify more aggressively"],answer:1,explanation:"After a long bull run, traders assume stocks always go up. After a crash, they assume they always go down. Recency bias causes overweighting of recent events in forward expectations, leading to buying high and selling low."}
    ]},


// ════════════════════════════════════════════════════════════
// UNIT 6 — Macro & Global Markets (lessons 83–100, platinum)
// ════════════════════════════════════════════════════════════

  { id:83, tier:'platinum', title:"Interest Rates (Deep Dive)",
    unit:"Macro & Global Markets", blurb:"The master variable that moves all markets.", icon:"rates",
    questions:[
      {q:"Interest rates affect asset valuations because:",options:["They change company revenues directly","They determine the discount rate applied to future cash flows — higher rates compress valuations across all asset classes","They only matter for bond investors","Companies can offset rate changes by raising prices"],answer:1,explanation:"Every financial asset's value is the present value of future cash flows. When the discount rate rises, each future dollar is worth less today — stocks, bonds, real estate, and private equity all compress. Rates are the master variable in finance."},
      {q:"The 'real interest rate' is:",options:["The rate set by the Federal Reserve","The nominal rate minus inflation — the true cost of borrowing in terms of purchasing power","The rate charged between banks","The average of all lending rates in the economy"],answer:1,explanation:"A 5% nominal rate with 3% inflation leaves a 2% real rate — the actual increase in purchasing power for lenders. Negative real rates (when inflation exceeds nominal rates) erode savings and push investors into riskier assets."},
      {q:"When real interest rates are deeply negative, investors typically:",options:["Hold more cash","Move into riskier assets (equities, real estate, commodities) to preserve purchasing power — sometimes called 'financial repression'","Move into government bonds","Reduce portfolio risk"],answer:1,explanation:"Negative real rates punish savers — cash loses purchasing power. This pushes capital into risk assets, inflating valuations. The 2020–2021 period of zero rates and high inflation exemplified this: asset prices surged as safe alternatives disappeared."}
    ]},

  { id:84, tier:'platinum', title:"The Federal Reserve",
    unit:"Macro & Global Markets", blurb:"The Fed's biggest lever on markets.", icon:"rates",
    questions:[
      {q:"The Federal Reserve's main policy rate is called:",options:["The prime rate","The federal funds rate","LIBOR","The discount window rate"],answer:1,explanation:"The federal funds rate is the overnight lending rate between banks — the Fed's primary policy tool for influencing borrowing costs across the entire economy."},
      {q:"When the Fed raises rates, it typically aims to:",options:["Stimulate more borrowing","Cool inflation","Increase money supply","Reduce government taxes"],answer:1,explanation:"Higher rates raise borrowing costs, slowing spending and investment, reducing inflationary pressure."},
      {q:"Higher interest rates tend to make growth stocks:",options:["More valuable","Less valuable","Immune to rate changes","Instantly profitable"],answer:1,explanation:"Higher rates reduce the present value of future earnings, compressing growth stock valuation multiples."},
      {q:"The 'yield curve' refers to:",options:["Bond yields plotted across maturities","A stock's price over time","The Fed's balance sheet","Commodity trends"],answer:0,explanation:"The yield curve plots rates for bonds of equal credit quality but different maturities — its shape signals economic expectations about growth and future rate policy."}
    ]},

  { id:85, tier:'platinum', title:"Monetary Policy",
    unit:"Macro & Global Markets", blurb:"How central banks manage the economy's temperature.", icon:"rates",
    questions:[
      {q:"Monetary policy is primarily the responsibility of:",options:["The elected government and treasury department","The central bank (e.g. the Federal Reserve in the US) operating with political independence","Commercial banks collectively","The International Monetary Fund"],answer:1,explanation:"Monetary policy is set by central banks, not elected governments — a deliberate design to insulate decisions from short-term political pressures. Central bank independence is considered critical for long-term price stability."},
      {q:"Expansionary (loose) monetary policy typically involves:",options:["Raising interest rates and selling bonds","Cutting interest rates and/or buying assets (QE) to stimulate borrowing, spending, and economic activity","Reducing government spending","Raising bank reserve requirements"],answer:1,explanation:"When the economy weakens, central banks cut rates to make borrowing cheaper — encouraging business investment and consumer spending. At the zero bound, they deploy QE (buying bonds) to push down longer-term rates."},
      {q:"The dual mandate of the US Federal Reserve is to:",options:["Maximise GDP growth and minimise taxes","Maintain maximum employment and stable prices (targeting ~2% inflation)","Control fiscal deficits and government debt","Regulate commercial banks only"],answer:1,explanation:"The Fed's two statutory goals are maximum employment and price stability. This creates inherent tension — keeping inflation low sometimes requires slowing growth and raising unemployment. The Fed constantly balances these competing objectives."}
    ]},

  { id:86, tier:'platinum', title:"Fiscal Policy",
    unit:"Macro & Global Markets", blurb:"How governments tax and spend to shape the economy.", icon:"rates",
    questions:[
      {q:"Fiscal policy refers to:",options:["Central bank decisions on interest rates","Government decisions on taxation and public spending to influence the economy","International trade agreements","Banking sector regulation"],answer:1,explanation:"Fiscal policy is the government's economic toolkit — raising or lowering taxes, and increasing or cutting public spending. Unlike monetary policy (the central bank's domain), fiscal policy is set by elected governments."},
      {q:"Expansionary fiscal policy involves:",options:["Raising taxes and cutting spending","Cutting taxes or increasing government spending — injecting demand into the economy","Raising interest rates","Reducing the money supply"],answer:1,explanation:"When an economy slows, governments can stimulate by spending more (on infrastructure, for example) or cutting taxes to put more money in consumers' pockets. Both increase aggregate demand — total spending in the economy."},
      {q:"The 'fiscal multiplier' concept suggests that:",options:["Government spending always equals tax revenue","A dollar of government spending can generate more than a dollar of economic output as it circulates through the economy","Taxes have no effect on economic growth","Fiscal and monetary policy always work in opposite directions"],answer:1,explanation:"When the government spends $1, the recipient earns income, some of which they spend, which becomes income for others who spend again. The total GDP impact can exceed the initial spending — though the multiplier's size is debated by economists."}
    ]},

  { id:87, tier:'platinum', title:"Yield Curve",
    unit:"Macro & Global Markets", blurb:"The bond market's economic forecast.", icon:"bond",
    questions:[
      {q:"The yield curve plots:",options:["A company's earnings growth over time","Interest rates (yields) for bonds of the same credit quality but different maturities","The S&P 500 price history","Currency exchange rates over time"],answer:1,explanation:"A yield curve shows what you earn lending to the same borrower (e.g. the US government) for different time periods — 3 months, 2 years, 10 years, 30 years. Its shape reveals market expectations about growth, inflation, and future policy."},
      {q:"A normal (upward-sloping) yield curve means:",options:["Short-term rates are higher than long-term rates","Long-term rates are higher than short-term — investors demand more compensation for lending for longer periods","All rates along the curve are equal","The economy is in recession"],answer:1,explanation:"Normally, lenders demand higher yields for committing money for longer — there's more uncertainty and inflation risk. The upward slope reflects a healthy, growing economy with moderate inflation expectations."},
      {q:"An inverted yield curve (short-term rates above long-term rates) is significant because:",options:["It signals strong economic growth","It has preceded every US recession since the 1950s — reflecting market expectations of future rate cuts due to anticipated economic weakness","It indicates the central bank is cutting rates","It occurs randomly and has no predictive value"],answer:1,explanation:"Inversion signals that investors expect the economy to slow — pushing the Fed to cut rates in the future. The 10-year minus 2-year Treasury spread inverting has been remarkably reliable as a leading recession indicator, though with variable lags of 6–24 months."}
    ]},

  { id:88, tier:'platinum', title:"Recession",
    unit:"Macro & Global Markets", blurb:"What they are, why they happen, and how to prepare.", icon:"risk",
    questions:[
      {q:"A recession is commonly defined as:",options:["A single month of negative GDP growth","Two or more consecutive quarters of negative GDP growth","A 20% fall in stock prices","High unemployment without growth changes"],answer:1,explanation:"The technical definition is two consecutive quarters of negative real GDP growth. The NBER (National Bureau of Economic Research) has a broader definition including employment, income, and spending data."},
      {q:"Which sectors tend to be most defensive during recessions?",options:["Technology and consumer discretionary","Utilities, consumer staples, and healthcare — demand for electricity, food, and medicine is relatively stable","Financial services","Luxury goods"],answer:1,explanation:"Defensive sectors provide goods and services with inelastic demand — people still need power, groceries, and medicine regardless of the economic cycle. Their cash flows are more stable during downturns."},
      {q:"The 'yield curve inversion' is considered a recession predictor because:",options:["The Fed directly causes recessions by raising rates","It reflects market expectations of future rate cuts due to anticipated economic weakness — these expectations embed forward-looking information","Banks only lend when the curve is steep","Inversions are random but frequently coincide with recessions"],answer:1,explanation:"The curve inverts when short-term expectations (policy rates will fall due to weakness) overwhelm long-term expectations. The forward-looking nature of bond markets gives the yield curve its predictive power."}
    ]},

  { id:89, tier:'platinum', title:"Stagflation",
    unit:"Macro & Global Markets", blurb:"The worst of both worlds for policymakers.", icon:"rates",
    questions:[
      {q:"Stagflation describes:",options:["High growth with low inflation","Simultaneous high inflation and economic stagnation (slow growth or recession) with high unemployment","Deflation during a boom","A rapid shift from boom to recession"],answer:1,explanation:"Stagflation is a policymaker's nightmare. Normally, inflation and unemployment move in opposite directions (the Phillips Curve). Stagflation breaks this relationship — you can't fix one without worsening the other."},
      {q:"The 1970s US stagflation was primarily triggered by:",options:["Technology sector collapse","Supply-side oil price shocks — OPEC embargoes raised energy costs, feeding inflation while simultaneously suppressing economic output","Excessive government spending alone","Rapid population growth"],answer:1,explanation:"The 1973 and 1979 oil shocks raised production costs across the entire economy simultaneously. This supply shock raised inflation while reducing real output — the classic stagflationary combination."},
      {q:"Stagflation is difficult for central banks to address because:",options:["Central banks lack tools","Raising rates to fight inflation worsens the economic slowdown; cutting rates to stimulate growth risks worsening inflation","Fiscal policy always solves stagflation","The currency always strengthens during stagflation"],answer:1,explanation:"Monetary policy faces an impossible trade-off. The Fed in the 1970s ultimately had to cause a deep recession (via aggressive rate hikes under Volcker) to break the inflationary spiral — accepting significant near-term pain."}
    ]},

  { id:90, tier:'platinum', title:"Quantitative Easing",
    unit:"Macro & Global Markets", blurb:"Creating money to buy bonds and stimulate the economy.", icon:"rates",
    questions:[
      {q:"Quantitative easing (QE) involves:",options:["The government reducing its spending","The central bank purchasing financial assets (typically government bonds) to inject money into the financial system","Raising interest rates above inflation","Selling foreign currency reserves"],answer:1,explanation:"QE is deployed when interest rates are already near zero and conventional monetary policy is exhausted. The central bank creates money and buys bonds, pushing down long-term yields and increasing bank reserves."},
      {q:"The primary mechanism through which QE stimulates the economy is:",options:["Directly paying households","Lowering long-term interest rates, boosting asset prices, and encouraging risk-taking and borrowing","Increasing tax revenue","Requiring banks to lend"],answer:1,explanation:"QE compresses yields on longer-dated bonds, making borrowing cheaper for companies and households. Rising asset prices create a 'wealth effect' that encourages spending. It works through multiple channels simultaneously."},
      {q:"Critics of QE argue it primarily benefits:",options:["Low-income workers","Asset owners — the wealthy disproportionately benefit from rising stock and property prices","Small businesses","Government bond issuers"],answer:1,explanation:"Since QE works partly by inflating asset prices, those who own the most assets — typically wealthier individuals — capture most of the benefit. Critics argue QE has exacerbated wealth inequality."}
    ]},

  { id:91, tier:'platinum', title:"Quantitative Tightening",
    unit:"Macro & Global Markets", blurb:"The reverse of QE — shrinking the balance sheet.", icon:"rates",
    questions:[
      {q:"Quantitative tightening (QT) is the process of:",options:["The central bank buying more bonds","The central bank reducing its balance sheet by allowing bonds to mature without reinvesting, or actively selling assets","Raising the reserve requirement","Reducing the money supply by printing less currency"],answer:1,explanation:"QT is QE in reverse — the Fed shrinks its asset holdings, removing money from the financial system. This tightens financial conditions, pushing long-term yields higher."},
      {q:"The expected market impact of QT is:",options:["Lower long-term yields and higher asset prices","Higher long-term yields and potential pressure on asset prices as the largest buyer exits the market","No effect on financial markets","Stronger economic growth immediately"],answer:1,explanation:"When the largest buyer (the Fed) stops reinvesting, bond supply increases relative to private demand — pushing yields up. Higher rates compress asset valuations and tighten credit conditions."},
      {q:"QT and interest rate hikes can be used simultaneously because:",options:["They contradict each other","Both tighten financial conditions independently — rate hikes target short-term rates while QT raises long-term yields","Only one can be used at a time","They offset each other's effects"],answer:1,explanation:"In 2022–23, the Fed combined aggressive rate hikes with QT — the most aggressive tightening in decades. They work through different channels but both reduce liquidity and tighten conditions."}
    ]},

  { id:92, tier:'platinum', title:"Inflation Hedges",
    unit:"Macro & Global Markets", blurb:"Assets that protect your purchasing power.", icon:"compound",
    questions:[
      {q:"An inflation hedge is an asset that:",options:["Has a fixed nominal return regardless of economic conditions","Tends to maintain or increase its real value when inflation rises, protecting purchasing power","Is guaranteed by the government","Only gains value in deflationary environments"],answer:1,explanation:"Inflation erodes the purchasing power of fixed cash flows. A good inflation hedge appreciates in nominal terms at least as fast as inflation — preserving what your wealth can actually buy."},
      {q:"TIPS (Treasury Inflation-Protected Securities) protect against inflation by:",options:["Paying a higher fixed coupon than regular Treasuries","Adjusting the principal value of the bond upward with the CPI — both the principal and interest payments grow with inflation","Guaranteeing a real return above inflation","Linking the coupon to the Fed funds rate"],answer:1,explanation:"TIPS are US government bonds where the face value is indexed to inflation. As CPI rises, your principal grows, and since interest is paid on the principal, your payments grow too. At maturity you receive the inflation-adjusted principal."},
      {q:"Historically, which asset class has served as the strongest long-run inflation hedge?",options:["Cash and money market funds","Long-term government bonds","Equities (stocks) — companies can often pass on rising costs through higher prices, protecting real returns","Cryptocurrencies"],answer:2,explanation:"Over very long periods, stocks have been the most reliable inflation hedge — companies generate real assets and earnings, and can raise prices. Real estate is also effective. Long-term bonds are among the worst inflation hedges since their fixed coupon is eroded by rising prices."}
    ]},

  { id:93, tier:'platinum', title:"Bonds vs Stocks (Macro Context)",
    unit:"Macro & Global Markets", blurb:"How rates and cycles shift the balance between them.", icon:"bond",
    questions:[
      {q:"During a recession, government bonds typically:",options:["Fall in value as the government needs to borrow more","Rise in value as investors seek safety and expect central banks to cut rates — both reduce yields and push bond prices up","Are unaffected by economic conditions","Fall due to credit risk concerns"],answer:1,explanation:"In recessions, investors flee to safety ('flight to quality'), buying government bonds. At the same time, central banks cut rates, which further pushes existing bond prices up. This is why bonds and stocks often move inversely in downturns."},
      {q:"The traditional 60/40 portfolio relies on the assumption that:",options:["Bonds always outperform stocks","Stocks and bonds are negatively correlated — when stocks fall, bonds rise, providing balance","Cash is the best defensive asset","Interest rates never change"],answer:1,explanation:"The negative correlation between stocks and bonds in normal conditions makes the 60/40 portfolio diversifying — bond gains cushion equity losses in downturns. This relationship broke down in 2022, when rising inflation caused both to fall simultaneously."},
      {q:"In a high-inflation environment, the stock-bond relationship tends to:",options:["Remain stable — both move in opposite directions as always","Become positively correlated — both suffer because rising inflation forces rate hikes that hurt bond prices and compress stock valuations","Strengthen the negative correlation","Become irrelevant to portfolio construction"],answer:1,explanation:"2022 demonstrated this: the Fed raised rates aggressively to fight inflation, causing bond prices to fall sharply while also compressing equity multiples. The classic negative correlation inverted — both the 'safe' and 'risky' assets lost, exposing the 60/40 portfolio's key vulnerability."}
    ]},

  { id:94, tier:'platinum', title:"Currency Markets",
    unit:"Macro & Global Markets", blurb:"The world's largest and most liquid market.", icon:"rates",
    questions:[
      {q:"The forex market is notable because:",options:["It is only accessible to central banks","It is the world's largest financial market by volume, trading over $7 trillion per day","It is highly regulated with fixed exchange rates","Only physical currencies are traded"],answer:1,explanation:"Foreign exchange dwarfs all other markets combined. It operates 24 hours a day, 5 days a week, with banks, corporations, hedge funds, and central banks all participating."},
      {q:"If a country raises interest rates, its currency typically:",options:["Weakens — higher rates deter investment","Strengthens — higher rates attract foreign capital seeking better returns","Stays the same","Only strengthens against emerging markets"],answer:1,explanation:"Capital flows where returns are highest. Higher interest rates attract foreign investors who must buy the local currency to invest — increasing demand for that currency and pushing its value up."},
      {q:"A country with persistently large trade deficits tends to see its currency:",options:["Strengthen over time","Face downward pressure — more currency flows out to pay for imports than flows in from exports","Be unaffected by trade flows","Benefit from deficit spending"],answer:1,explanation:"Persistent trade deficits mean constant currency outflows to pay foreign exporters. Without offsetting capital inflows, this selling pressure tends to weaken the domestic currency over time."}
    ]},

  { id:95, tier:'platinum', title:"Commodities",
    unit:"Macro & Global Markets", blurb:"The raw materials that power the global economy.", icon:"compound",
    questions:[
      {q:"Commodities differ from financial assets primarily because:",options:["They are more volatile","They are physical raw materials — their value comes from utility, not cash flows or claims on assets","They are always more liquid","They are not traded on exchanges"],answer:1,explanation:"Commodities (oil, wheat, copper, gold) are physical goods with intrinsic utility. Their prices are driven by supply and demand for the underlying material — weather, geopolitics, and production costs all matter."},
      {q:"Which commodity is most directly tied to global economic activity as a leading indicator?",options:["Gold","Copper — its industrial uses are so broad that its price is known as 'Dr. Copper' for its predictive power on economic growth","Oil alone","Agricultural commodities"],answer:1,explanation:"Copper is used in construction, electronics, manufacturing, and infrastructure. Rising copper prices signal expanding industrial activity. It's a real-time barometer of global economic health."},
      {q:"Commodity prices and the US dollar typically have:",options:["A strong positive correlation","A negative correlation — most commodities are priced in USD, so a weaker dollar makes them cheaper in other currencies, boosting demand","No relationship","A perfect positive correlation"],answer:1,explanation:"Since most commodities are priced in USD globally, a weaker dollar makes them cheaper for non-USD buyers — increasing demand and putting upward pressure on prices. Dollar strength often suppresses commodity prices."}
    ]},

  { id:96, tier:'platinum', title:"Gold",
    unit:"Macro & Global Markets", blurb:"Why the oldest money still matters.", icon:"compound",
    questions:[
      {q:"Gold is often considered a 'store of value' because:",options:["It generates strong cash flows","It cannot be inflated away — unlike fiat currency, its supply grows slowly and governments cannot print it","It consistently outperforms equities","Its price is stable"],answer:1,explanation:"Gold's appeal is its scarcity and independence from any single country's monetary policy. Governments can devalue currencies but can't create gold. This makes it a hedge against currency debasement."},
      {q:"Gold typically performs well during periods of:",options:["High real interest rates and economic growth","High inflation, financial stress, or geopolitical uncertainty — when confidence in paper assets erodes","Low commodity prices","Strong USD performance"],answer:1,explanation:"Gold is a safe haven: when real yields are negative (holding cash destroys purchasing power) and uncertainty is high, investors pay for the certainty of gold's scarcity and independence."},
      {q:"Gold's main weakness as an investment is:",options:["It is too volatile","It produces no income — no dividends, interest, or cash flows. You are simply betting on price appreciation","It is illiquid","It cannot be stored safely"],answer:1,explanation:"Warren Buffett famously noted that gold just sits there producing nothing. Over very long time horizons, income-generating assets like equities have dramatically outperformed gold in real terms."}
    ]},

  { id:97, tier:'platinum', title:"Oil Markets",
    unit:"Macro & Global Markets", blurb:"The commodity that moves the global economy.", icon:"rates",
    questions:[
      {q:"OPEC's primary role is to:",options:["Regulate financial derivatives","Coordinate oil production levels among member countries to influence global oil prices","Set fuel taxes","Fund oil exploration globally"],answer:1,explanation:"OPEC (Organization of Petroleum Exporting Countries) acts as a cartel — members coordinate output decisions to support or stabilise prices, wielding significant influence over global energy markets."},
      {q:"Rising oil prices generally act as a:",options:["Stimulus for oil-importing economies","Tax on oil-importing economies — higher energy costs raise inflation and reduce consumer and business spending power","Benefit to all economies equally","Deflationary force"],answer:1,explanation:"Countries that import more oil than they produce face higher costs when oil rises — airlines, shipping, manufacturing, and consumers all pay more. This drains discretionary spending and can fuel inflation."},
      {q:"The 'oil price' most commonly quoted refers to:",options:["A global average of all crude grades","The benchmark price for specific grades — WTI (West Texas Intermediate) for US markets and Brent Crude internationally","Refined petrol prices at the pump","OPEC's official selling price"],answer:1,explanation:"WTI and Brent are the two global oil benchmarks. They trade as futures contracts on exchanges and serve as the pricing reference for contracts worldwide, though the exact price of different crude grades varies."}
    ]},

  { id:98, tier:'platinum', title:"Crypto Basics",
    unit:"Macro & Global Markets", blurb:"What cryptocurrency actually is — and isn't.", icon:"compound",
    questions:[
      {q:"Bitcoin is best described as:",options:["A government-issued digital currency","A decentralised digital currency secured by cryptography and running on a distributed network with a fixed supply","A stock representing ownership in a tech company","A central bank reserve currency"],answer:1,explanation:"Bitcoin is decentralised — no government or company controls it. Its supply is capped at 21 million coins. Transactions are recorded on a public blockchain validated by a distributed network of computers."},
      {q:"A key risk of cryptocurrency compared to traditional assets is:",options:["Too much regulation","Extreme volatility and lack of consumer protections — prices can fall 80–90% and hacks or exchange failures offer little recourse","Fixed returns","Government guarantees"],answer:1,explanation:"Crypto markets are highly speculative with limited fundamental anchors. There's no FDIC insurance, no earnings model, no central bank backstop — investors can lose the majority of their capital rapidly."},
      {q:"The difference between a cryptocurrency and a central bank digital currency (CBDC) is:",options:["CBDCs use blockchain; crypto doesn't","CBDCs are issued and controlled by a central bank — not decentralised. A CBDC is digital fiat; crypto is a decentralised alternative to fiat","They are identical","Crypto is regulated; CBDCs are not"],answer:1,explanation:"CBDCs are the digital equivalent of cash — government-issued, centrally controlled, and programmable. Decentralised cryptocurrencies like Bitcoin exist precisely as an alternative to this government-controlled model."}
    ]},

  { id:99, tier:'platinum', title:"Blockchain",
    unit:"Macro & Global Markets", blurb:"The distributed ledger powering digital assets.", icon:"compound",
    questions:[
      {q:"A blockchain is best described as:",options:["A type of stock exchange","A distributed, append-only ledger maintained by a network of computers — each transaction is recorded in a block linked to the previous one","A private database owned by a bank","A type of encryption algorithm"],answer:1,explanation:"A blockchain is a shared database where data is grouped in blocks, linked chronologically, and cryptographically secured. No single entity controls it — the network collectively validates and maintains the record."},
      {q:"The immutability of a blockchain means:",options:["Data can be changed only by the creator","Once validated and recorded, transactions cannot be altered without rewriting the entire subsequent chain — making fraud prohibitively difficult","Data is automatically deleted","It is infinitely scalable"],answer:1,explanation:"To alter a past transaction, you'd need to redo the cryptographic work for every subsequent block and control 51%+ of the network's computing power — virtually impossible in large, established networks."},
      {q:"Smart contracts on blockchains are:",options:["Legal agreements filed with courts","Self-executing code that automatically enforces the terms of an agreement when predefined conditions are met","Human lawyers who verify transactions","Terms of service for exchanges"],answer:1,explanation:"A smart contract removes the need for intermediaries — the code executes automatically when conditions are fulfilled. If stock price hits X, release Y payment. No bank, lawyer, or escrow agent needed."}
    ]},

  { id:100, tier:'platinum', title:"Financial Bubbles & Liquidity Crises",
    unit:"Macro & Global Markets", blurb:"When asset prices detach from reality — and what comes next.", icon:"risk",
    questions:[
      {q:"A financial bubble is characterised by:",options:["Steady, fundamentals-driven price appreciation","Prices rising far above intrinsic value driven by speculation and herd behaviour, followed by a sharp collapse","Slow, controlled price increases","Government-mandated price levels"],answer:1,explanation:"Bubbles share common features: rapid price acceleration, 'new era' narratives to justify valuations, widespread public participation, leverage, and ultimately a collapse when fundamentals reassert themselves."},
      {q:"A liquidity crisis occurs when:",options:["Asset prices fall gradually","Participants are unable to sell assets at any reasonable price — the market for that asset effectively dries up","Interest rates rise slowly","Only one institution faces financial difficulties"],answer:1,explanation:"Liquidity crises are characterised by a sudden collapse in market function. Prices can't clear because buyers disappear — not because assets are worthless, but because no one will bid at any price."},
      {q:"A consistent warning sign that a bubble may be forming is:",options:["Rising corporate earnings","Widespread narrative that 'this time is different' — justifying valuations that would be unsustainable under any historical framework","Declining volatility","Low trading volume"],answer:1,explanation:"'This time is different' is perhaps the most dangerous phrase in finance. Every bubble features compelling narratives — tulips, railways, the internet, housing — explaining why usual valuation rules don't apply. They always do eventually."}
    ]}

]; // end LESSONS

function _slugifyQuestionMeta(value, fallback) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function _inferLegacyQuestionDifficulty(lesson, question) {
  if (question?.difficulty) return question.difficulty;
  if (lesson?.tier === 'platinum') return 'hard';
  if (lesson?.tier === 'gold') return 'medium';
  return 'easy';
}

function ensureQuestionMetadata(question, {
  lessonId = 'misc',
  lessonTitle = '',
  unit = '',
  tier = 'standard',
  index = 0,
  topicId = null
} = {}) {
  if (!question || typeof question !== 'object') return question;

  const fallbackTopic = topicId
    || question.topicId
    || question.topic
    || lessonTitle
    || unit
    || `lesson-${lessonId}`;
  const normalizedTopicId = _slugifyQuestionMeta(fallbackTopic, `lesson-${lessonId}`);

  if (!question.questionId) {
    question.questionId = question.id || `lesson-${lessonId}-q${index + 1}`;
  }
  if (!question.topicId) {
    question.topicId = normalizedTopicId;
  }
  if (!question.difficulty) {
    question.difficulty = _inferLegacyQuestionDifficulty({ tier }, question);
  }

  return question;
}

function _decodeMiniLessonText(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function _cleanMiniLessonText(text, maxLength = 190) {
  const normalized = _decodeMiniLessonText(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;

  const shortened = normalized.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${(lastSpace > 80 ? shortened.slice(0, lastSpace) : shortened).trim()}…`;
}

function _extractCourseMiniLessonCards(course) {
  if (!course?.body) return [];

  const cards = [];
  const body = String(course.body || '');
  const highlightMatch = body.match(/<span class="highlight">([\s\S]*?)<\/span>/i);
  if (highlightMatch?.[1]) {
    cards.push({
      title: 'Big Idea',
      text: _cleanMiniLessonText(highlightMatch[1])
    });
  }

  const sectionRegex = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
  let match = null;
  while ((match = sectionRegex.exec(body)) && cards.length < 4) {
    const title = _cleanMiniLessonText(match[1], 48);
    const text = _cleanMiniLessonText(match[2]);
    if (!title || !text) continue;
    cards.push({ title, text });
  }

  if (cards.length < 3) {
    const paragraphRegex = /<p>([\s\S]*?)<\/p>/gi;
    while ((match = paragraphRegex.exec(body)) && cards.length < 4) {
      const text = _cleanMiniLessonText(match[1]);
      if (!text) continue;
      cards.push({
        title: cards.length === 0 ? 'Overview' : `Concept ${cards.length + 1}`,
        text
      });
    }
  }

  return cards;
}

function buildMiniLessonContent(lesson) {
  if (!lesson || typeof lesson !== 'object') return [];

  const explicitCards = Array.isArray(lesson.miniLessonContent)
    ? lesson.miniLessonContent
    : [];
  const explicit = explicitCards
    .map(card => ({
      title: _cleanMiniLessonText(card?.title || '', 48),
      text: _cleanMiniLessonText(card?.text || card?.body || '')
    }))
    .filter(card => card.title && card.text);

  const courseCards = typeof COURSES !== 'undefined'
    ? _extractCourseMiniLessonCards(COURSES[lesson.id])
    : [];

  const explanationTitles = ['Core Idea', 'Example', 'Key Rule', 'Quick Takeaway'];
  const explanationCards = (lesson.questions || [])
    .map((question, index) => ({
      title: explanationTitles[Math.min(index, explanationTitles.length - 1)],
      text: _cleanMiniLessonText(question?.explanation || '')
    }))
    .filter(card => card.text);

  const overviewText = _cleanMiniLessonText(lesson.blurb || '');
  const cards = [];
  const seenTexts = new Set();

  const pushCard = (title, text) => {
    const normalizedTitle = _cleanMiniLessonText(title, 48) || 'Concept';
    const normalizedText = _cleanMiniLessonText(text);
    if (!normalizedText || seenTexts.has(normalizedText)) return;
    cards.push({ title: normalizedTitle, text: normalizedText });
    seenTexts.add(normalizedText);
  };

  if (overviewText) {
    pushCard('Overview', overviewText);
  }

  [...explicit, ...courseCards, ...explanationCards].forEach(card => {
    pushCard(card.title, card.text);
  });

  while (cards.length < 3 && explanationCards.length) {
    const fallback = explanationCards[cards.length - 1] || explanationCards[0];
    pushCard(fallback.title, fallback.text);
    if (cards.length >= 3) break;
  }

  if (cards.length < 3 && lesson.title) {
    pushCard('Quick Takeaway', `Learn the essentials of ${lesson.title.toLowerCase()} before you take the quiz.`);
  }

  return cards.slice(0, 5);
}

LESSONS.filter(Boolean).forEach(lesson => {
  lesson.accessTier = typeof getLessonAccessTier === 'function'
    ? getLessonAccessTier(lesson)
    : lesson.tier;
  lesson.miniLessonContent = buildMiniLessonContent(lesson);
  lesson.questions = (lesson.questions || []).map((question, index) =>
    ensureQuestionMetadata(question, {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      unit: lesson.unit,
      tier: lesson.tier,
      index
    })
  );
});

if (typeof window !== 'undefined') {
  window.LESSONS = LESSONS;
  window.ensureQuestionMetadata = ensureQuestionMetadata;
  window.buildMiniLessonContent = buildMiniLessonContent;
}
