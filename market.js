// ============================================================
// market.js
// Market page interactive features — owns Market feature metadata,
// Market page rendering, and all Market feature entry points.
//
//   openMarketFeature(featureId) — entry point from feature cards
//   getMarketFeatures()          — Market feature registry
//   renderMarket()               — Market screen card renderer
//
//   Daily Market Prediction → prediction modal
//   What Happened Next?     → daily chart game
//   Stock Market Simulation → allocation + simulation
//   Market Drills           → market-scoped fluency training
//   Financial Duels         → placeholder modal
//
// Legacy scenario runner code is still present below for future reuse,
// but the old scenario cards are no longer surfaced on the Market page.
//
// Legacy XP awards (on correct answer only):
//   Scenario   → +20 XP
//   Market Event → +25 XP
//   Case Study   → +30 XP
//
// State: S.portfolio persisted via save() (state.js)
// Depends on: state.js (S, save), app.js (showToast, updateTopbar,
//             showXpPop, showAppModal, closeAppModal)
// ============================================================


// ── XP PER CORRECT ANSWER ────────────────────────────────────
const MARKET_XP = {
  'investment-scenarios': 20,
  'market-events':        25,
  'case-studies':         30,
};


// ══════════════════════════════════════════════════════════════
// SCENARIO BANKS
// ══════════════════════════════════════════════════════════════

const SCENARIO_BANK = {

  // ── Investment Scenarios (Analyst) ────────────────────────
  'investment-scenarios': [
    {
      situation: 'A stock you hold drops 10% after an earnings report misses analyst estimates by just $0.02 per share.',
      question:  'What is the most rational investor response?',
      choices: [
        'Panic sell immediately to avoid further losses',
        'Re-evaluate the company\'s fundamentals and long-term thesis',
        'Buy more shares immediately to lower your average cost',
        'Ignore the report entirely — short-term noise doesn\'t matter',
      ],
      correct: 1,
      explanation: 'A small earnings miss doesn\'t invalidate a long-term thesis. Rational investors re-evaluate fundamentals before acting — panic selling locks in losses, while blind buying ignores a potential signal worth investigating.',
    },
    {
      situation: 'A company reports revenue growth of 30% year-over-year, but its stock falls 8% on the earnings day.',
      question:  'What is the most likely reason the stock fell despite strong revenue growth?',
      choices: [
        'Markets are always irrational in the short term',
        'Growth was below analyst expectations — missing the "whisper number"',
        'Revenue growth is irrelevant to stock price',
        'The company must have undisclosed debt',
      ],
      correct: 1,
      explanation: 'Stock prices reflect expectations, not just raw numbers. If analysts expected 40% growth and got 30%, that\'s a miss — even though 30% is objectively strong. Markets price forward expectations, not historical results.',
    },
    {
      situation: 'Inflation reaches 8% — the highest level in 40 years. You hold stocks, bonds, and cash.',
      question:  'Which holding is most likely to lose real purchasing power during high inflation?',
      choices: [
        'Dividend-paying blue-chip stocks',
        'Commodity-linked ETFs',
        'Long-duration government bonds',
        'Real estate investment trusts (REITs)',
      ],
      correct: 2,
      explanation: 'Long-duration bonds have fixed coupon payments. When inflation rises, those payments are worth less in real terms — and rising rates (which follow inflation) directly reduce bond prices via duration risk. Short-term bonds and inflation-linked bonds suffer far less.',
    },
    {
      situation: 'A company announces a $2 billion share buyback program.',
      question:  'What is the most direct effect on existing shareholders?',
      choices: [
        'Dilutes existing shares, reducing each shareholder\'s ownership percentage',
        'Has no meaningful effect on shareholders',
        'Reduces shares outstanding, which mechanically increases earnings per share (EPS)',
        'Forces shareholders to sell their shares back at market price',
      ],
      correct: 2,
      explanation: 'When a company buys back shares, the total share count falls. The same earnings are now divided among fewer shares, so EPS rises. This typically supports the stock price and often signals management believes the stock is undervalued.',
    },
    {
      situation: 'A startup you are evaluating has $10M in annual revenue, 80% year-over-year growth, but is burning $5M per month.',
      question:  'What is the most critical risk to assess first as an investor?',
      choices: [
        'Whether revenue growth is organic or driven by discounting',
        'Runway — how many months of cash remain at the current burn rate',
        'The founding team\'s prior startup experience',
        'Whether the product has strong user reviews',
      ],
      correct: 1,
      explanation: 'At $5M/month burn, cash position is the most urgent risk. Even explosive growth becomes irrelevant if the company runs out of money before reaching profitability or its next funding round. Runway is always the first check for high-burn businesses.',
    },
  ],

  // ── Market Events (VP) ────────────────────────────────────
  'market-events': [
    {
      situation: 'The Federal Reserve unexpectedly raises interest rates by 0.75% — the largest single hike in 28 years.',
      question:  'Which asset class is most immediately and negatively affected?',
      choices: [
        'Long-duration government bonds',
        'Commodities such as gold and oil',
        'Cash and money market funds',
        'Value stocks with high dividend yields',
      ],
      correct: 0,
      explanation: 'Bond prices move inversely to interest rates. Long-duration bonds are most sensitive because their cash flows extend far into the future — each percentage-point rate increase can cut their price by 10–20%. Cash and short-term instruments actually benefit from higher rates.',
    },
    {
      situation: 'A major bank announces it holds $20 billion in mortgage-backed securities that are now valued below their purchase price.',
      question:  'What does this most likely signal to markets?',
      choices: [
        'The bank will become more profitable as rates rise',
        'Potential liquidity and solvency concerns requiring emergency capital',
        'Mortgage rates are about to fall, benefiting homeowners',
        'The housing market is about to recover strongly',
      ],
      correct: 1,
      explanation: 'Securities worth less than book value represent unrealised losses. If the bank is forced to sell, those losses crystallise. Markets immediately price in the risk the bank may need emergency capital, face a credit downgrade, or struggle to meet obligations — as happened in 2023.',
    },
    {
      situation: 'Oil prices spike 40% in a month following geopolitical conflict in a major oil-producing region.',
      question:  'Which sector is most likely to benefit from this event?',
      choices: [
        'Airlines and global logistics companies',
        'Consumer discretionary retailers dependent on shipping',
        'Domestic energy producers and integrated oil majors',
        'Technology companies relying on cloud infrastructure',
      ],
      correct: 2,
      explanation: 'Domestic oil producers directly profit when the commodity they sell rises in price — their revenue increases while costs remain relatively stable. Airlines, retail, and tech face margin pressure as energy becomes a larger input cost.',
    },
    {
      situation: 'GDP growth falls to −0.4% for two consecutive quarters, officially triggering a recession.',
      question:  'Which asset class has historically performed best as a defensive store of value during recessions?',
      choices: [
        'Small-cap growth stocks',
        'Cryptocurrency',
        'U.S. Treasury bonds',
        'Emerging market equities',
      ],
      correct: 2,
      explanation: 'During recessions, investors flee to safety. U.S. Treasuries are backed by the government and tend to rise in price as central banks cut rates to stimulate growth. Small-cap and emerging market equities carry higher risk and typically sell off more aggressively in downturns.',
    },
    {
      situation: 'A major tech company\'s quarterly earnings beat analyst estimates by 25%, but its guidance for next quarter is 15% below consensus.',
      question:  'What is the most likely short-term stock reaction?',
      choices: [
        'Strong rally on the large earnings beat',
        'Decline or muted reaction, because weak guidance outweighs the beat',
        'No change — prior-quarter earnings are already priced in',
        'A trading halt pending regulatory investigation',
      ],
      correct: 1,
      explanation: 'Markets are forward-looking. Guidance for the next quarter carries more weight than backward-looking results because it tells investors what the company expects to earn going forward. Weak forward guidance often causes stocks to fall even when current results are strong.',
    },
  ],

  // ── Case Studies (Director) ───────────────────────────────
  'case-studies': [
    {
      situation: 'FinCo Q3 results: Revenue +20% YoY. Net profit −15% YoY. Operating costs +45% YoY.',
      question:  'What is the most likely explanation for this outcome?',
      choices: [
        'The company committed accounting fraud to inflate revenue',
        'Costs scaled faster than revenue, compressing net margins',
        'A large one-time tax liability created an artificial profit decline',
        'Revenue growth was driven by unsustainable discounting',
      ],
      correct: 1,
      explanation: 'Revenue up, profit down typically signals operating leverage working in reverse — costs (headcount, sales, infrastructure) grew faster than revenue. This is common in companies investing aggressively for growth, but is a red flag if the cost trajectory doesn\'t improve as scale increases.',
    },
    {
      situation: 'RetailCorp trades at a P/E ratio of 45x. Its closest competitor has similar margins and growth, but trades at 18x P/E.',
      question:  'What does RetailCorp\'s premium valuation most likely reflect?',
      choices: [
        'A data error in the publicly reported financial statements',
        'Market expectation of significantly higher future growth from RetailCorp',
        'RetailCorp carries substantially less debt than its competitor',
        'A recent stock split that has distorted the ratio',
      ],
      correct: 1,
      explanation: 'A P/E premium signals the market expects RetailCorp to grow faster, deliver better margins, or sustain earnings for longer. Investors pay more per dollar of current earnings when they expect more future earnings. A premium P/E is either justified by fundamentals or represents speculative excess.',
    },
    {
      situation: 'AcquireCo bids $8B for TargetCo, which has a current market cap of $5.5B — a 45% premium over market price.',
      question:  'What primarily justifies paying a 45% premium over market price?',
      choices: [
        'Securities regulation legally requires a minimum 30% premium on all acquisitions',
        'Expected synergies — cost savings and revenue gains from combining the businesses',
        'The target\'s auditors require a premium to sign off on the deal',
        'The acquirer believes the target\'s stock was previously overvalued by the market',
      ],
      correct: 1,
      explanation: 'The acquisition premium reflects synergies — the additional value the combined entity can create that neither could achieve alone: eliminating duplicate costs, cross-selling customers, accessing new markets. If synergies justify the premium, the deal creates value. If they don\'t materialise, the acquirer overpaid.',
    },
    {
      situation: 'StartupX raises a Series B at a $500M valuation. It has $25M in annual recurring revenue and no profitability path for 4+ years.',
      question:  'What revenue multiple does this valuation represent — and is it typical?',
      choices: [
        '2x ARR — unusually low, suggesting the company was undervalued',
        '20x ARR — historically normal for high-growth SaaS in bull markets',
        '200x ARR — an obvious indicator of fraud or bubble speculation',
        '0.5x ARR — implying the market doesn\'t believe the revenue is real',
      ],
      correct: 1,
      explanation: '20x ARR is standard for high-growth software companies in bull markets. Investors are buying expected future revenue, not current revenue. However, when rates rise or growth slows, these multiples compress sharply — explaining the 60–80% SaaS valuation declines seen in 2022.',
    },
    {
      situation: 'MegaCorp announces a spinoff of its consumer division into a separately listed public company.',
      question:  'Why might the board prefer a spinoff over simply selling the division to a strategic buyer?',
      choices: [
        'Spinoffs are required by regulation once a company exceeds a certain asset threshold',
        'To let the market value the division independently, potentially unlocking hidden value',
        'Because the division had negative revenue and no strategic buyer would purchase it',
        'To reduce the parent company\'s total outstanding share count',
      ],
      correct: 1,
      explanation: 'Spinoffs unlock hidden value when a business unit is undervalued because it\'s obscured inside a large conglomerate. As a standalone company, it can attract specialist investors and have focused management. Research consistently shows spinoffs outperform their parents post-separation — the classic "sum of parts" argument.',
    },
  ],
};


// ══════════════════════════════════════════════════════════════
// SCENARIO RUNNER STATE
// ══════════════════════════════════════════════════════════════

let _mBank      = [];  // current shuffled scenario set (3 per session)
let _mIdx       = 0;   // index into _mBank
let _mSelected  = null; // index of currently selected choice
let _mLocked    = false; // true after Check is pressed
let _mFeatureId = '';
let _mXpTotal   = 0;   // XP earned this session
let _mStartXp   = 0;   // XP snapshot at the start of this session


// ══════════════════════════════════════════════════════════════
// MARKET FEATURE REGISTRY + PAGE RENDER
// ══════════════════════════════════════════════════════════════

const MARKET_FEATURES = [
  {
    id:           'daily-market-prediction',
    title:        'Daily Market Prediction',
    desc:         'Make one daily market call, lock your pick, and come back tomorrow for the reveal.',
    icon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:18px;height:18px">
                    <path d="M4 18l5-5 4 3 7-8"/>
                    <path d="M14 8h6v6"/>
                  </svg>`,
    requiredRank: 'Analyst',
    requiredXp:   500,
    btnLabel:     'Make Pick'
  },
  {
    id:           'guess-the-chart',
    title:        'What Happened Next?',
    desc:         'Study the setup, then choose how the chart actually finished.',
    icon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:18px;height:18px">
                    <polyline points="3 16 8 12 12 14 17 8 21 10"/>
                    <path d="M3 20h18"/>
                  </svg>`,
    requiredRank: 'VP',
    requiredXp:   3500,
    btnLabel:     'Play Daily'
  },
  {
    id:           'portfolio-simulator',
    title:        'Stock Market Simulation',
    desc:         'Buy simple share positions with your earned cash and track a live practice portfolio.',
    icon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:18px;height:18px">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>`,
    requiredRank: 'Associate',
    requiredXp:   1500,
    btnLabel:     'Open'
  },
  {
    id:           'market-mastery',
    title:        'Market Drills',
    desc:         'Run fast market reps on volatility, valuation, liquidity, earnings, and more.',
    icon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:18px;height:18px">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M9 12l2 2 4-5"/>
                  </svg>`,
    requiredRank: 'Director',
    requiredXp:   7000,
    btnLabel:     'Start Drills'
  },
  {
    id:           'finance-duels',
    title:        'Financial Duels',
    desc:         'Head-to-head finance battles are on the roadmap. Build your edge first.',
    icon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:18px;height:18px">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>`,
    requiredRank: 'Managing Director',
    requiredXp:   12000,
    btnLabel:     'Coming Soon',
    future:       true
  }
];

function getMarketFeatures() {
  return MARKET_FEATURES;
}

function _getMarketFeatureById(featureId) {
  return MARKET_FEATURES.find(feature => feature.id === featureId) || null;
}

function _renderMarketActivitySectionMarkup() {
  const challengeFeatures = [
    _getMarketFeatureById('daily-market-prediction'),
    _getMarketFeatureById('guess-the-chart'),
    _getMarketFeatureById('market-mastery')
  ].filter(Boolean);
  const futureFeature = _getMarketFeatureById('finance-duels');

  return `
    <div class="market-page-stack market-activity-shell">
      <div class="market-list-section market-activity-section">
        ${_renderMarketSectionHead(
          'Market Challenges',
          'Keep the daily loop alive with one clean prediction, one chart read, and fast market reps.'
        )}
        <div class="market-activity-stack">
          ${challengeFeatures.map(feature => `
            <button type="button" class="market-activity-row" onclick="openMarketFeature('${feature.id}')">
              <div class="market-activity-icon">${feature.icon}</div>
              <div class="market-activity-copy">
                <div class="market-activity-title">${feature.title}</div>
                <div class="market-activity-sub">${feature.desc}</div>
              </div>
              <div class="market-activity-action">${feature.btnLabel}</div>
            </button>
          `).join('')}
        </div>
      </div>
      ${futureFeature ? `
        <div class="market-list-section market-activity-section market-activity-section-future">
          ${_renderMarketSectionHead(
            'Coming Soon',
            'Future-facing ideas stay here until they earn a real place in the core investing loop.'
          )}
          <button type="button" class="market-activity-row market-activity-row-future" onclick="openMarketFeature('${futureFeature.id}')">
            <div class="market-activity-icon">${futureFeature.icon}</div>
            <div class="market-activity-copy">
              <div class="market-activity-title">${futureFeature.title}</div>
              <div class="market-activity-sub">${futureFeature.desc}</div>
            </div>
            <div class="market-activity-pill">Coming Soon</div>
          </button>
        </div>
      ` : ''}
    </div>`;
}

function openMarketFeatureEntry(featureId) {
  if (!featureId) return;
  if (typeof showMarket === 'function') showMarket();
  setTimeout(() => openMarketFeature(featureId), 80);
}

// ══════════════════════════════════════════════════════════════
// MARKET EDUCATION CONTENT
// Plain-English read of the day + behavior-focused question, mistake,
// and term. The market screen teaches investing behavior, not numbers.
// ══════════════════════════════════════════════════════════════

// Snapshot + "what this means", keyed by the broad market's direction.
const MARKET_READS = {
  up: {
    headline: 'Stocks moved higher today.',
    snapshot: 'Most large U.S. companies gained value. Green days are common and usually need no action from a long-term investor.',
    why: 'Buyers were more eager than sellers today — often driven by upbeat economic news, strong company earnings, or plain optimism. No single headline ever explains a whole market.',
    means: 'An up day feels exciting, but buying more than you planned just because prices rose is how people overpay. The long-term trend matters far more than any single green day.',
    takeaway: 'Green days are normal. Keep contributing on your own schedule and ignore the urge to chase a rally.'
  },
  down: {
    headline: 'Stocks moved lower today.',
    snapshot: 'Most large U.S. companies lost value. Red days are a normal part of investing, not an emergency.',
    why: 'Sellers outweighed buyers today — usually a mix of economic worries, profit-taking, or nervous sentiment. Most daily drops have no single, clean cause.',
    means: 'A down day tests your nerves more than your portfolio. For money you will not need for years, a dip is mostly noise. Selling in fear is what turns a temporary drop into a permanent loss.',
    takeaway: 'Red days are the price of long-term growth. Don’t sell in a panic — staying invested is what lets your money compound.'
  },
  flat: {
    headline: 'A quiet day for the market.',
    snapshot: 'Large U.S. stocks barely moved. Calm stretches are normal and make up most trading days.',
    why: 'Buyers and sellers were roughly balanced, so prices drifted. Quiet days rarely have a dramatic story behind them.',
    means: 'Quiet days are a reminder that investing is mostly waiting. Real returns come from staying invested across many ordinary days, not from reacting to any single one.',
    takeaway: 'Most days are quiet. Consistency, not timing, is what builds wealth over the long run.'
  }
};

// Behavior-focused questions. `correct` marks the right answer to the prompt.
const MARKET_QUESTIONS = [
  {
    prompt: "The market drops sharply today. What is usually the worst reaction for a long-term investor?",
    choices: [
      { text: 'Review your goals', correct: false, feedback: "That is a calm, healthy response — not the mistake here." },
      { text: 'Stay diversified', correct: false, feedback: "Smart and steady — diversification is what cushions a drop." },
      { text: 'Panic sell everything', correct: true, feedback: "Correct. Panic selling locks in losses and misses the recovery — the classic worst move." },
      { text: 'Keep learning', correct: false, feedback: "A great use of a scary day — not the wrong move." }
    ]
  },
  {
    prompt: "Everyone is buying a stock because it 'only goes up.' What is the safer mindset?",
    choices: [
      { text: 'Buy as much as you can before it rises more', correct: false, feedback: "That is chasing hype — buying because others are. It often means buying near the top." },
      { text: 'Be cautious; hype usually fades', correct: true, feedback: "Right. When everyone is certain and piling in, risk is highest, not lowest." },
      { text: 'Put your whole savings into it', correct: false, feedback: "Going all-in on hype is how people get badly hurt. Spread your risk." },
      { text: 'Assume it can never fall', correct: false, feedback: "Anything that 'only goes up' eventually surprises people. Stay skeptical." }
    ]
  },
  {
    prompt: "Which habit best helps an everyday investor build wealth over time?",
    choices: [
      { text: 'Investing a set amount regularly', correct: true, feedback: "Yes. Steady, automatic investing beats trying to time the market for almost everyone." },
      { text: 'Checking prices every hour', correct: false, feedback: "Constant checking fuels anxiety and impulsive moves, not returns." },
      { text: 'Jumping between hot stocks', correct: false, feedback: "Chasing winners usually means buying high and selling low." },
      { text: "Waiting for the 'perfect' time", correct: false, feedback: "The perfect moment never comes. Time in the market beats timing it." }
    ]
  },
  {
    prompt: "Your portfolio is down 15% this year. For money you will not need for a decade, what matters most?",
    choices: [
      { text: 'Selling to avoid further losses', correct: false, feedback: "Selling turns a paper dip into a real, permanent loss." },
      { text: 'Staying invested and sticking to your plan', correct: true, feedback: "Right. Over a decade, a single down year is usually noise. Staying invested is what works." },
      { text: 'Switching everything to cash', correct: false, feedback: "Cash feels safe but locks in the loss and lags inflation long-term." },
      { text: 'Doubling down on one risky bet', correct: false, feedback: "Trying to make it back fast with one bet adds risk, not safety." }
    ]
  },
  {
    prompt: "What does diversification actually protect you from?",
    choices: [
      { text: 'Any chance of losing money', correct: false, feedback: "Nothing removes all risk. Diversification reduces it, it does not erase it." },
      { text: 'One company or sector sinking your whole portfolio', correct: true, feedback: "Exactly. Spreading out means no single failure can wipe you out." },
      { text: 'Market-wide downturns entirely', correct: false, feedback: "A broad downturn still hurts — diversification mainly guards against single-bet disasters." },
      { text: 'Ever having to review your investments', correct: false, feedback: "You will still want to check in occasionally; it just lowers single-point risk." }
    ]
  },
  {
    prompt: "A flashy account promises to 'double your money in a month.' What is the right read?",
    choices: [
      { text: 'Act fast before the chance disappears', correct: false, feedback: "Urgency is a pressure tactic. Real investing does not work on a countdown." },
      { text: 'Treat it as a likely scam', correct: true, feedback: "Right. Guaranteed, fast, huge returns are the hallmark of a scam." },
      { text: 'Invest a little to test it', correct: false, feedback: "Even a little into a scam is money gone. The promise itself is the red flag." },
      { text: 'Ask them for more guarantees', correct: false, feedback: "More guarantees just mean bigger lies. No one can promise doubling in a month." }
    ]
  }
];

const INVESTOR_MISTAKES = [
  { name: 'Panic selling', text: "Selling in fear during a drop. It turns a temporary paper loss into a permanent one — and often happens right before the recovery." },
  { name: 'Chasing hype', text: "Buying something just because it is soaring and everyone is talking about it. By the time it is popular, you are often buying near the top." },
  { name: 'Overconcentration', text: "Putting too much money in one stock or sector. One bad surprise can sink your whole portfolio. Spreading out is the fix." },
  { name: 'Timing the market', text: "Trying to buy the exact bottom and sell the exact top. Almost nobody does it reliably — staying invested usually wins." },
  { name: 'Checking too often', text: "Watching prices constantly. It spikes anxiety and tempts impulsive trades. Long-term investing rewards patience, not vigilance." },
  { name: 'Ignoring fees', text: "Overlooking the small percentages funds charge. Over decades, high fees quietly eat a large share of your returns." },
  { name: 'Performance chasing', text: "Pouring money into last year's best performer. Winners rotate, and yesterday's star is often tomorrow's laggard." }
];

const MARKET_TERMS = [
  { term: 'Volatility', def: "How much a price swings up and down.", example: "A stock that jumps 5% one day and falls 4% the next is highly volatile." },
  { term: 'Diversification', def: "Spreading money across many investments so no single one can sink you.", example: "Owning an index fund of 500 companies instead of one stock." },
  { term: 'Bear market', def: "A sustained market decline, usually 20% or more from recent highs.", example: "Early 2020 was a short, sharp bear market." },
  { term: 'Bull market', def: "A sustained market rise with broad optimism.", example: "The long climb in U.S. stocks through the 2010s." },
  { term: 'Index', def: "A basket that tracks a slice of the market.", example: "The S&P 500 tracks 500 large U.S. companies." },
  { term: 'Dividend', def: "A share of company profits paid out to shareholders.", example: "A company paying $0.50 per share every quarter." },
  { term: 'Liquidity', def: "How quickly you can turn something into cash without losing value.", example: "Cash is instant; a house can take months to sell." },
  { term: 'Compound interest', def: "Earning returns on your past returns, so growth snowballs.", example: "$1,000 at 8% becomes about $2,160 in 10 years, adding nothing." },
  { term: 'P/E ratio', def: "Price divided by earnings — how much you pay for each $1 of profit.", example: "A P/E of 25 means paying $25 for $1 of annual earnings." }
];

// Deterministic daily pick so the question/mistake/term are stable per day
// but differ from each other (via salt).
function _marketDailyIndex(salt, length) {
  if (!length) return 0;
  const key = ((typeof today === 'function' ? today() : '') || '') + '|' + salt;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % length;
}

// In-memory selection for today's market question ({ date, index }).
let _marketQuestionPick = null;
let _marketDecisionPick = null;
let _marketDecisionResponse = '';
let _marketDecisionBusy = false;

// The Market educational sections (question, mistake, term) are collapsed by
// default. Their open state is kept in module scope so it survives the
// renderMarket() re-render (e.g. when the user picks a question answer) —
// preserving both any selection and the open/closed state of every section.
const _marketSectionOpen = { question: false, mistake: false, term: false };

function _toggleMarketSection(key, toggleId, panelId) {
  _marketSectionOpen[key] = !_marketSectionOpen[key];
  const open = _marketSectionOpen[key];
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  if (panel) panel.classList.toggle('open', open);
  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.classList.toggle('is-open', open);
  }
}

function toggleMarketQuestion() { _toggleMarketSection('question', 'marketQToggle', 'marketQPanel'); }
function toggleMarketMistake()  { _toggleMarketSection('mistake', 'marketMistakeToggle', 'marketMistakePanel'); }
function toggleMarketTerm()     { _toggleMarketSection('term', 'marketTermToggle', 'marketTermPanel'); }

function selectMarketQuestion(index) {
  _marketQuestionPick = { date: (typeof today === 'function' ? today() : ''), index };
  renderMarket();
}

function _getMarketTone() {
  const liveSpy = _marketSnapshot?.quotes?.SPY;
  const liveChange = Number(liveSpy?.changePct ?? liveSpy?.dailyChangePct);
  if (Number.isFinite(liveChange)) {
    if (liveChange > 0.05) return 'up';
    if (liveChange < -0.05) return 'down';
    return 'flat';
  }
  const rows = _getSimpleMarketIndicators();
  const broad = rows.find(row => row.symbol === 'SPY') || rows[0] || { tone: 'flat' };
  return broad.tone === 'up' || broad.tone === 'down' ? broad.tone : 'flat';
}

function _getMarketStory(read, tone) {
  if (tone === 'up') {
    return {
      happened: read.headline || 'The market moved higher today.',
      why: 'Investors were more willing to buy than sell, often because expectations around inflation, rates, earnings, or growth improved.',
      matters: 'When expectations improve, stock prices can rise before the real-world impact is obvious.',
      beginner: 'Markets move on expectations, not just current facts. One day is a clue, not a plan.'
    };
  }
  if (tone === 'down') {
    return {
      happened: read.headline || 'The market moved lower today.',
      why: 'Investors were more cautious, often because expectations around rates, earnings, inflation, or growth became less comfortable.',
      matters: 'Lower prices can feel alarming, but volatility is a normal cost of long-term investing.',
      beginner: 'A market drop tests behavior. Diversification and time horizon matter more than reacting quickly.'
    };
  }
  return {
    happened: read.headline || 'The market was quiet today.',
    why: 'Buyers and sellers were roughly balanced, so prices did not move much in either direction.',
    matters: 'Most market days are ordinary. Long-term results come from staying consistent through many quiet days.',
    beginner: 'Investing is mostly patience. Calm days are part of the process, not a signal to do something.'
  };
}

const MARKET_DECISION_PROMPT = {
  scenario: 'Markets fall 20% next month.',
  question: 'What would you do?',
  choices: [
    'Sell everything',
    'Wait',
    'Keep investing',
    'Invest more'
  ]
};

function _cleanMarketTutorText(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function selectTodayMarketDecision(index) {
  const choice = MARKET_DECISION_PROMPT.choices[index];
  if (!choice || _marketDecisionBusy) return;
  _marketDecisionPick = index;
  _marketDecisionResponse = '';
  _marketDecisionBusy = true;
  renderMarket();
  try {
    const context = typeof _marketTutorContext === 'function'
      ? _marketTutorContext().text
      : 'The user is learning from a market scenario.';
    const body = {
      mode: 'chat',
      context,
      messages: [{
        role: 'user',
        content: [
          `Scenario: ${MARKET_DECISION_PROMPT.scenario}`,
          `User choice: ${choice}`,
          'Explain the likely consequences in a calm educational way.',
          'Do not call it right or wrong. Do not give financial advice.',
          'Keep it under 120 words.'
        ].join('\n')
      }]
    };
    const response = await fetch('/api/ask-finlingo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Tutor request failed (${response.status})`);
    _marketDecisionResponse = _cleanMarketTutorText(payload.answer) || 'FinLingo could not explain this choice right now.';
  } catch (error) {
    _marketDecisionResponse = error?.message || 'FinLingo could not explain this choice right now.';
  } finally {
    _marketDecisionBusy = false;
    renderMarket();
  }
}

function _renderTodayDecisionCard() {
  const answered = Number.isInteger(_marketDecisionPick);
  const choices = MARKET_DECISION_PROMPT.choices.map((choice, index) => `
    <button type="button"
            class="market-decision-choice${_marketDecisionPick === index ? ' is-selected' : ''}"
            onclick="selectTodayMarketDecision(${index})"
            ${_marketDecisionBusy ? 'disabled' : ''}>
      <span>${String.fromCharCode(65 + index)}</span>
      ${_escapeMarketHtml(choice)}
    </button>
  `).join('');
  return `
    <section class="market-learning-card market-decision-card">
      <div class="market-card-kicker">Today's decision</div>
      <h2>${_escapeMarketHtml(MARKET_DECISION_PROMPT.scenario)}</h2>
      <p>${_escapeMarketHtml(MARKET_DECISION_PROMPT.question)}</p>
      <div class="market-decision-grid">${choices}</div>
      <div class="market-decision-response${answered || _marketDecisionBusy ? ' show' : ''}">
        ${_marketDecisionBusy ? 'FinLingo is thinking…' : _escapeMarketHtml(_marketDecisionResponse || 'Choose an option to see the tradeoffs.')}
      </div>
    </section>`;
}

const MARKET_LESSON_LINKS = [
  { label: 'Diversification', lessonId: 15 },
  { label: 'Volatility', lessonId: 13 },
  { label: 'Long-term investing', lessonId: 4 }
];

function _lessonTitleForMarketLink(item) {
  const lesson = typeof LESSONS !== 'undefined'
    ? LESSONS.find(entry => entry.id === item.lessonId)
    : null;
  return lesson?.title || item.label;
}

// Build today's market→lesson connection. When the 10-year Treasury moved, the
// story is framed around rates → Bonds + Inflation (the canonical example);
// otherwise it falls back to the broad-tone concepts. This is what turns Market
// into a learning engine: a real event, the concepts behind it, and a one-click
// path into the matching lesson + quiz.
function _getMarketConnection() {
  const tnx = _marketSnapshot?.quotes?.['^TNX'];
  const yieldChange = Number(tnx?.changePct ?? tnx?.dailyChangePct);
  if (Number.isFinite(yieldChange) && Math.abs(yieldChange) >= 0.4) {
    const higher = yieldChange > 0;
    return {
      headline: higher ? 'Rates moved higher today.' : 'Rates moved lower today.',
      connects: 'This connects to Bonds and Inflation.',
      hook: higher
        ? 'When rates rise, existing bonds tend to fall in price and borrowing gets pricier — a core idea behind inflation and bond math.'
        : 'When rates fall, existing bonds tend to rise in price and borrowing gets cheaper — a core idea behind inflation and bond math.',
      links: [
        { label: 'Bonds', lessonId: 2 },
        { label: 'Inflation', lessonId: 10 },
        { label: 'Interest rates', lessonId: 83 }
      ]
    };
  }
  const tone = _getMarketTone();
  if (tone === 'down') {
    return {
      headline: 'Stocks moved lower today.',
      connects: 'This connects to Volatility and Diversification.',
      hook: 'Down days are where diversification and a long time horizon earn their keep.',
      links: [
        { label: 'Volatility', lessonId: 13 },
        { label: 'Diversification', lessonId: 15 },
        { label: 'Inflation', lessonId: 10 }
      ]
    };
  }
  if (tone === 'up') {
    return {
      headline: 'Stocks moved higher today.',
      connects: 'This connects to ETFs and Long-term investing.',
      hook: 'Green days are a chance to understand what you own, not to chase the rally.',
      links: [
        { label: 'ETFs', lessonId: 3 },
        { label: 'Diversification', lessonId: 15 },
        { label: 'Compound interest', lessonId: 9 }
      ]
    };
  }
  return {
    headline: 'A quiet day for the market.',
    connects: 'This connects to Compound interest and Long-term investing.',
    hook: 'Quiet days are most days — the real returns come from staying consistent through them.',
    links: [
      { label: 'Compound interest', lessonId: 9 },
      { label: 'Diversification', lessonId: 15 },
      { label: 'Inflation', lessonId: 10 }
    ]
  };
}

function _renderMarketLessonCard() {
  const connection = _getMarketConnection();
  const links = (connection.links || []).map(item => `
    <button type="button" onclick="openCourse(${item.lessonId})">
      <span>✓</span>
      <strong>${_escapeMarketHtml(item.label)}</strong>
      <small>${_escapeMarketHtml(_lessonTitleForMarketLink(item))}</small>
    </button>
  `).join('');
  return `
    <section class="market-learning-card market-connect-card">
      <div class="market-card-kicker">Market → lesson</div>
      <h2>${_escapeMarketHtml(connection.headline)} <span class="market-connect-link">${_escapeMarketHtml(connection.connects)}</span></h2>
      <p class="market-connect-hook">${_escapeMarketHtml(connection.hook)}</p>
      <div class="market-connect-cta">
        <button type="button" class="btn btn-primary" onclick="runAskFinLingoMode('market_explainer','market')">Want a 60-second explanation?</button>
      </div>
      <div class="market-connect-divider"><span>Jump straight into a lesson</span></div>
      <div class="market-concept-links">${links}</div>
    </section>`;
}

function _renderMarketPersonalizationCard() {
  const completedIds = Array.isArray(S?.completedIds) ? S.completedIds.map(Number) : [];
  const completedTitles = (typeof LESSONS !== 'undefined' ? LESSONS : [])
    .filter(lesson => completedIds.includes(Number(lesson.id)))
    .slice(-2)
    .map(lesson => lesson.title);
  const recommended = (typeof LESSONS !== 'undefined' ? LESSONS : [])
    .find(lesson => lesson.id === 3 && !completedIds.includes(3))
    || (typeof getNextAvailableLesson === 'function' ? getNextAvailableLesson(completedIds, S?.user) : null)
    || (typeof LESSONS !== 'undefined' ? LESSONS.find(lesson => !completedIds.includes(Number(lesson.id))) : null);
  return `
    <section class="market-learning-card market-personal-card">
      <div class="market-card-kicker">Your learning journey</div>
      <p>${completedTitles.length
        ? `You've completed ${_escapeMarketHtml(completedTitles.join(' and '))}.`
        : 'Start with the basics, then connect each market story back to a lesson.'}</p>
      <p>This market story is related to ETFs, diversification, and volatility.</p>
      ${recommended ? `
        <button type="button" onclick="openCourse(${recommended.id})">
          Recommended next lesson: <strong>${_escapeMarketHtml(recommended.title)}</strong>
        </button>` : ''}
    </section>`;
}

function _renderAskMarketPromptsCard() {
  const prompts = [
    ['example', 'Give Example'],
    ['connect_known', 'Connect This to What I Know'],
    ['chat', 'Why did markets react this way?', 'Why did markets react this way?'],
    ['quiz', 'Quiz Me']
  ];
  return `
    <section class="market-learning-card market-ask-card">
      <div class="market-card-kicker">Ask</div>
      <h2>Use the story as a learning moment.</h2>
      <div class="market-ask-prompts">
        ${prompts.map(([mode, label, prompt]) => `
          <button type="button" onclick="runAskFinLingoMode('${mode}','market',${prompt ? `'${_escapeMarketHtml(prompt)}'` : 'null'})">${_escapeMarketHtml(label)}</button>
        `).join('')}
      </div>
      <small>Educational only. Not financial advice.</small>
    </section>`;
}

// Large hero illustration — "insight": an upward chart panel + currency coin on
// a soft tinted backdrop, layered with soft shadows for depth.
const MARKET_HERO = `<svg viewBox="0 0 200 176" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="mkLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <linearGradient id="mkArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <linearGradient id="mkCoin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d1d5db"/></linearGradient>
    <filter id="mkSh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#0b3d24" flood-opacity="0.14"/></filter>
  </defs>
  <circle cx="100" cy="88" r="74" fill="#e9f6ee"/>
  <ellipse cx="100" cy="152" rx="64" ry="9" fill="#0b0d10" opacity="0.05"/>
  <g filter="url(#mkSh)">
    <rect x="34" y="46" width="132" height="86" rx="14" fill="#ffffff" stroke="#0b0d10" stroke-width="3"/>
    <path d="M46 110 L72 94 L92 102 L114 78 L138 88 L156 60 L156 120 L46 120 Z" fill="url(#mkArea)"/>
    <path d="M46 110 L72 94 L92 102 L114 78 L138 88 L156 60" stroke="url(#mkLine)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="114" cy="78" r="4" fill="#ffffff"/>
    <circle cx="156" cy="60" r="4" fill="#ffffff"/>
  </g>
  <g filter="url(#mkSh)">
    <circle cx="158" cy="126" r="19" fill="url(#mkCoin)"/>
    <text x="158" y="133.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="800" fill="#ffffff">$</text>
  </g>
  <path d="M52 38 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 z" fill="#ffffff" opacity="0.8"/>
</svg>`;

// ══════════════════════════════════════════════════════════════
// MARKET V3 — AI-POWERED MARKET UNDERSTANDING
// Not a dashboard. A calm learning surface: what happened, why it
// matters, and what the learner can ask next.
// ══════════════════════════════════════════════════════════════

function renderMarket() {
  const container = document.getElementById('marketFeatureList');
  if (!container) return;

  // Stop any in-flight Ask typewriter before the DOM it writes into is replaced.
  _stopMarketAskTypewriter();

  // Single column on mobile; a balanced, restrained two-column split on desktop
  // (left: price + chart + Quick Take, right: Ask + Topics + Recap).
  container.innerHTML = `
    <div class="market-v3-shell">
      <div class="market-v3-grid">
        <div class="market-v3-col market-v3-col-primary">
          <section class="market-global-section">
            <div class="mono-label mono-label--block market-global-label">Global Markets</div>
            <!-- Real per-symbol quotes (SPY/QQQ/BTC/10Y) — reuses the existing
                 snapshot renderer; painted + refreshed by _paintMarketSnapshot(). -->
            <div id="marketSnapshotCards" class="snap-cards market-global-grid">${_renderMarketSnapshotCardsInner()}</div>
          </section>

          <section class="market-watchlist-section">
            <div class="mono-label mono-label--block market-global-label">Curated Watchlist</div>
            <div id="marketWatchlist" class="market-watchlist">${_renderMarketWatchlistInner()}</div>
          </section>

          <section class="market-v3-hero" id="marketTodayHero">
            ${_renderMarketTodayHeroInner()}
          </section>

          <section class="market-sentiment-section" id="marketSentiment">
            ${_renderMarketSentimentInner()}
          </section>

          <section class="market-v3-insight" id="marketInsightCard">
            ${_renderMarketInsightInner()}
          </section>
        </div>

        <div class="market-v3-col market-v3-col-secondary">
          ${_renderMarketV3Topics()}
        </div>
      </div>
      <p class="market-page-foot">Educational summary, not investment advice.</p>
    </div>`;

  // Kick off (or refresh) live data. The tutor is called only on click.
  ensureMarketSnapshot();
  ensureMarketChart();
  _observeMarketChartResize();
}

// ── Market hero chart (selectable index / asset) ────────────────────
const MARKET_CHART_RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'];

// Shared Market selector config. Symbols are passed straight to the Yahoo proxy.
const MARKET_ASSETS = [
  { key: 'sp500', name: 'S&P 500', symbol: 'SPY', kind: 'etf', type: 'ETF', currency: 'USD', description: 'S&P 500 index ETF', tracks: 'S&P 500', badge: 'S&P 500 ETF · SPY' },
  { key: 'qqq', name: 'QQQ', symbol: 'QQQ', kind: 'etf', type: 'ETF', currency: 'USD', description: 'Nasdaq-100 ETF', tracks: 'Nasdaq-100', badge: 'Nasdaq-100 ETF · QQQ' },
  { key: 'btc', name: 'Bitcoin', symbol: 'BTC-USD', kind: 'crypto', type: 'crypto', currency: 'USD', description: 'Cryptocurrency', badge: 'Crypto · BTC' },
  // Curated Watchlist single-stock instruments. These reuse the existing
  // stock session logic (PRACTICE_MARKET_ASSETS) and the /api/quotes proxy;
  // adding them here lets the watchlist rows drive the same chart selector.
  { key: 'aapl', name: 'Apple', symbol: 'AAPL', kind: 'stock', type: 'stock', currency: 'USD', description: 'Apple Inc.', badge: 'Stock · AAPL' },
  { key: 'nvda', name: 'Nvidia', symbol: 'NVDA', kind: 'stock', type: 'stock', currency: 'USD', description: 'NVIDIA Corp.', badge: 'Stock · NVDA' },
  { key: 'tsla', name: 'Tesla', symbol: 'TSLA', kind: 'stock', type: 'stock', currency: 'USD', description: 'Tesla, Inc.', badge: 'Stock · TSLA' }
];
// Curated Watchlist — ordered instruments with a short sector descriptor.
// Prices/percentages come ONLY from the live snapshot fetch; a row with no
// real quote is dropped (never fabricated). assetKey ties a row to the chart.
const MARKET_WATCHLIST = [
  { assetKey: 'aapl', symbol: 'AAPL', name: 'Apple',    sector: 'Technology' },
  { assetKey: 'nvda', symbol: 'NVDA', name: 'Nvidia',   sector: 'Semiconductors' },
  { assetKey: 'tsla', symbol: 'TSLA', name: 'Tesla',    sector: 'Autos · EV' },
  { assetKey: 'sp500', symbol: 'SPY', name: 'S&P 500',  sector: 'US large-cap index' },
  { assetKey: 'btc',  symbol: 'BTC',  name: 'Bitcoin',  sector: 'Crypto' }
];
const MARKET_ASSET_KEY = 'finlingo_selected_market_asset';
function _normalizeMarketAssetKey(key) {
  return key === 'nasdaq' ? 'qqq' : key;
}
function _marketAssetByKey(key) {
  return MARKET_ASSETS.find(a => a.key === _normalizeMarketAssetKey(key)) || MARKET_ASSETS[0];
}
function _loadSelectedAsset() {
  try {
    const k = _normalizeMarketAssetKey(localStorage.getItem(MARKET_ASSET_KEY));
    if (k && MARKET_ASSETS.some(a => a.key === k)) {
      if (k === 'qqq') localStorage.setItem(MARKET_ASSET_KEY, k);
      return k;
    }
  } catch {}
  return 'sp500';
}
function _currentAsset() { return _marketAssetByKey(_marketChart.asset); }

const _marketChart = {
  asset: _loadSelectedAsset(),
  range: '1D',
  status: 'idle',   // idle | loading | ready | error
  points: [],
  marketOpen: null,
  previousClose: null,
  interval: '',
  pointCount: 0,
  error: '',
  inFlight: false,
  token: 0
};
let _marketAskSheetOpen = false;
let _marketAskExpanded = false;
let _marketAssetMenuOpen = false;
let _marketChartView = null;
let _marketScrubPointerId = null;
let _marketScrubRestoreTimer = null;

function _normalizeMarketChartPoints(points) {
  const sorted = (points || [])
    .map((p, index) => ({ value: Number(p?.value), time: _marketPointTime(p, index) }))
    .filter(p => Number.isFinite(p.value) && Number.isFinite(p.time))
    .sort((a, b) => a.time - b.time);
  const deduped = [];
  sorted.forEach(point => {
    const previous = deduped[deduped.length - 1];
    if (previous?.time === point.time) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  });
  return deduped;
}

function _marketReferenceForNormalized(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const range = String(_marketChart.range || '1D').toUpperCase();
  const asset = _currentAsset();
  const first = Number(points[0].value);
  const previousClose = Number(_marketChart.previousClose);
  if (range === '1D') {
    // Prefer the normalized snapshot's previous close (the same regular-session
    // close the header, cards and recap use) so the chart baseline matches the
    // headline change exactly; fall back to the chart's own previous close.
    const snapPrev = Number(_normalizedMarketSnapshot(asset.key).previousClose);
    if (Number.isFinite(snapPrev) && snapPrev > 0) {
      return { value: snapPrev, label: 'Previous close', source: 'previousClose' };
    }
    if (asset.kind !== 'crypto' && Number.isFinite(previousClose) && previousClose > 0) {
      return { value: previousClose, label: 'Previous close', source: 'previousClose' };
    }
    return { value: first, label: 'Start of day', source: 'firstPoint' };
  }
  const labels = {
    '1W': 'Start of week',
    '1M': 'Start of month',
    '3M': 'Start of period',
    'YTD': 'Start of year',
    '1Y': 'One year ago',
    '5Y': 'Five years ago'
  };
  return { value: first, label: labels[range] || 'Period start', source: 'firstPoint' };
}

function _marketChartStats() {
  const normalized = _normalizeMarketChartPoints(_marketChart.points);
  if (normalized.length < 2) return null;
  const reference = _marketReferenceForNormalized(normalized);
  const first = Number(reference?.value);
  const last = normalized[normalized.length - 1].value;
  if (!Number.isFinite(first)) return null;
  const change = last - first;
  const pct = first ? (change / first) * 100 : 0;
  return { first, last, change, pct, positive: change >= 0, reference };
}

function _marketFallbackStats() {
  // Only the live snapshot's Bitcoin quote is a valid same-scale fallback;
  // index values come from the chart fetch itself (no SPY substitution).
  const a = _currentAsset();
  const q = a.kind === 'crypto' ? _marketSnapshot.quotes?.BTC : null;
  const price = Number(q?.price);
  if (!Number.isFinite(price)) return null;
  const change = Number(q?.change);
  const pct = Number(q?.changePct ?? q?.dailyChangePct);
  return {
    first: Number.isFinite(change) ? price - change : price,
    last: price,
    change: Number.isFinite(change) ? change : 0,
    pct: Number.isFinite(pct) ? pct : 0,
    positive: (Number.isFinite(change) ? change : 0) >= 0
  };
}

function _marketAssetUsesUsd(asset = _currentAsset()) {
  return String(asset?.currency || '').toUpperCase() === 'USD';
}

// Per-asset value/change formatting. Every asset here is dollar-denominated
// (SPY and QQQ are ETFs, BTC is priced in USD), so all show a $ — the headline
// is an instrument price, never an index level. The ticker badge in the hero
// makes clear it is the ETF, not the underlying index.
function _formatAssetValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const useUsd = _marketAssetUsesUsd();
  const num = n.toLocaleString(undefined, {
    minimumFractionDigits: useUsd ? 2 : 0,
    maximumFractionDigits: 2
  });
  return useUsd ? `$${num}` : num;
}
function _formatAssetChange(change) {
  const n = Number(change);
  if (!Number.isFinite(n)) return '—';
  // Decide the sign AFTER rounding to the displayed precision so a value that
  // rounds to zero (e.g. -0.004) never keeps a stray minus ("-$0.00").
  const rounded = _roundDisplay(n, 2);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  const num = Math.abs(rounded).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return _marketAssetUsesUsd() ? `${sign}$${num}` : `${sign}${num}`;
}

// Round to `digits` and normalize -0 to 0. Shared by every signed market
// formatter so a rounded-zero value can never render with a negative sign.
function _roundDisplay(value, digits = 2) {
  const factor = 10 ** digits;
  const r = Math.round((Number(value) || 0) * factor) / factor;
  return r === 0 ? 0 : r;
}

// Canonical signed percentage. Sign is derived from the ROUNDED value, so
// "-0.00%" can never appear — a percentage that rounds to zero shows "0.00%".
function _formatSignedPctClean(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = _roundDisplay(n, digits);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`;
}

function _marketDisplayStats() {
  return _marketChartStats() || _marketFallbackStats();
}

// ── Normalized market snapshot ──────────────────────────────────────
// ONE source of truth per asset. The graph header, the headline change %, the
// snapshot cards and the (on-page + AI) recap all read these values, so they
// can never disagree. Every field comes from the SAME live quote — the
// regular-session price and the previous *regular-session* close — so we never
// mix an after-hours price in one place with a regular-session close in
// another. `available: false` means live data has not loaded; callers should
// show a delayed/unavailable state rather than invent numbers.
const _ASSET_QUOTE_SYMBOL = { sp500: 'SPY', qqq: 'QQQ', btc: 'BTC', aapl: 'AAPL', nvda: 'NVDA', tsla: 'TSLA' };
function _assetQuoteSymbol(asset) {
  const key = (asset && asset.key) || _marketChart.asset;
  return _ASSET_QUOTE_SYMBOL[key] || (asset && asset.symbol) || 'SPY';
}
function _normalizedMarketSnapshot(assetKey) {
  const asset = _marketAssetByKey(assetKey);
  const symbol = _assetQuoteSymbol(asset);
  const quote = _marketSnapshot.quotes ? _marketSnapshot.quotes[symbol] : null;
  const status = _getAssetMarketStatus(_findPracticeAsset(symbol) || asset || { symbol });
  const price = Number(quote && quote.price);
  const prev = Number(quote && quote.previousClose);
  const change = Number(quote && quote.change);
  const pct = Number(quote && quote.changePct);
  const available = Number.isFinite(price) && price > 0;
  return {
    assetKey: asset.key,
    name: asset.name,
    symbol,
    currentPrice: available ? price : null,
    previousClose: Number.isFinite(prev) && prev > 0 ? prev : null,
    absoluteChange: available && Number.isFinite(change) ? change : null,
    percentChange: available && Number.isFinite(pct) ? pct : null,
    sessionStatus: status.session,           // open | premarket | afterhours | closed | crypto
    sessionTone: status.tone,
    timestamp: Number(_marketSnapshot.fetchedAt) || null,
    // Regular-session quote; flagged stale when the last fetch errored.
    source: _marketSnapshot.status === 'error' ? 'quotes (delayed)' : 'quotes',
    available
  };
}
// Dev-only: log all normalized snapshots once per fetch so the graph and recap
// values can be compared directly in the console.
function _logMarketSnapshots() {
  try {
    const dev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
      || /[?&]marketdebug=1/.test(location.search);
    if (!dev) return;
    const all = MARKET_ASSETS.map(a => _normalizedMarketSnapshot(a.key));
    console.log('[market] normalized snapshots', all);
  } catch (_) { /* logging must never break the page */ }
}

function _marketToneFromStats(stats = _marketDisplayStats()) {
  if (!stats) return 'flat';
  if (stats.change > 0) return 'up';
  if (stats.change < 0) return 'down';
  return 'flat';
}

function _marketPointTime(point, fallbackIndex = 0) {
  const raw = point?.time ?? point?.timestamp ?? point?.date ?? point?.datetime ?? point?.t;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackIndex;
}

function _formatMarketCrosshairTime(timeValue) {
  if (!Number.isFinite(timeValue) || timeValue < 1000) return '';
  const d = new Date(timeValue);
  if (Number.isNaN(d.getTime())) return '';
  const range = String(_marketChart.range || '1D').toUpperCase();
  if (range === '1D') return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (range === '1W') {
    return d.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '');
  }
  if (range === '5Y') return d.toLocaleDateString([], { month: 'short', year: 'numeric' });
  if (range === '1Y') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function _marketScrubPeriodText() {
  switch (String(_marketChart.range || '1D').toUpperCase()) {
    case '1D': return _currentAsset().kind === 'crypto'
      ? 'today'
      : (Number(_marketChart.previousClose) > 0 ? 'since previous close' : 'since start of day');
    case '1W': return 'since the start of the week';
    case '1M': return 'since the start of the month';
    case '3M': return 'over 3 months';
    case 'YTD': return 'since the start of the year';
    case '1Y': return 'over the past year';
    case '5Y': return 'over 5 years';
    default: return 'since the start of the selected period';
  }
}

function _marketChangeClass(change) {
  const n = Number(change);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

function _setMarketHeroDisplay(value, change, pct, suffix) {
  const valueEl = document.getElementById('marketHeroValue');
  const changeEl = document.getElementById('marketHeroChange');
  if (valueEl) valueEl.textContent = _formatAssetValue(value);
  if (changeEl) {
    const cls = _marketChangeClass(change);
    const pctText = `${pct >= 0 ? '+' : '-'}${Math.abs(pct || 0).toFixed(2)}%`;
    changeEl.className = `market-v3-change ${cls}`;
    changeEl.innerHTML = `${_escapeMarketHtml(_formatAssetChange(change))} (${_escapeMarketHtml(pctText)})`;
  }
}

function _restoreMarketHeroDisplay() {
  const stats = _marketDisplayStats();
  if (!stats) return;
  _setMarketHeroDisplay(stats.last, stats.change, stats.pct, _marketChangePeriodWord());
  _hideMarketCrosshair();
}

// Build a gap-collapsed horizontal axis from the cleaned, time-sorted points.
// Each inter-point gap is capped at a few multiples of the typical spacing so
// closed-market periods (nights / weekends) collapse to a thin break instead of
// a large blank section, yet legitimate spacing is still visible. Returns one
// cumulative position per point (0 .. axisSpan); positions map straight to x.
function _marketChartAxisPositions(normalized) {
  const n = normalized.length;
  if (n <= 1) return [0];
  const deltas = [];
  for (let i = 1; i < n; i++) {
    const d = normalized[i].time - normalized[i - 1].time;
    if (d > 0) deltas.push(d);
  }
  // Typical spacing = median positive delta (robust to gaps and outliers).
  let typical = 0;
  if (deltas.length) {
    const sorted = deltas.slice().sort((a, b) => a - b);
    typical = sorted[Math.floor(sorted.length / 2)] || 0;
  }
  const cap = typical > 0 ? typical * 3 : Infinity;
  const pos = [0];
  for (let i = 1; i < n; i++) {
    let d = normalized[i].time - normalized[i - 1].time;
    if (!(d > 0)) d = typical > 0 ? typical : 1; // duplicates already removed; guard
    if (d > cap) d = cap;                         // collapse closed-market blanks
    pos[i] = pos[i - 1] + d;
  }
  return pos;
}

function _buildHeroChartSvg(points) {
  const normalized = _normalizeMarketChartPoints(points);
  if (normalized.length < 2) return '';
  const W = 600, H = 210;
  const pad = { top: 16, right: 8, bottom: 26, left: 4 };
  const vals = normalized.map(p => p.value);
  const reference = _marketReferenceForNormalized(normalized);
  const referenceValue = Number(reference?.value);
  const hasReference = Number.isFinite(referenceValue) && referenceValue > 0;
  const scaleVals = hasReference ? vals.concat(referenceValue) : vals;
  const rawMin = Math.min(...scaleVals);
  const rawMax = Math.max(...scaleVals);
  const rawSpan = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.01, 1);
  const min = rawMin - rawSpan * 0.08;
  const max = rawMax + rawSpan * 0.08;
  const span = max - min || 1;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  // X axis: progress along a gap-collapsed timeline derived from the real
  // timestamps. Closed-market periods (overnight / weekend) are capped so they
  // collapse to roughly one normal interval instead of leaving a wide blank
  // horizontal section, while every consecutive valid point still connects as
  // one continuous line. The first/last points stay anchored to the plot edges.
  const axisPos = _marketChartAxisPositions(normalized);
  const axisSpan = axisPos[axisPos.length - 1] || (normalized.length - 1) || 1;
  const xFor = index => pad.left + (axisPos[index] / axisSpan) * plotW;
  const yFor = value => pad.top + (1 - (value - min) / span) * plotH;
  const coords = normalized.map((p, i) => [xFor(i), yFor(p.value), p]);
  // One continuous path across all consecutive valid points — no separate
  // segments. The cleaned coords array maps directly into the SVG path.
  const linePath = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const firstX = coords[0][0];
  const lastX = coords[coords.length - 1][0];
  const areaPath = `${linePath} L${lastX.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L${firstX.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;
  const linePaths = [linePath];
  const areaPaths = [areaPath];
  const baseline = hasReference ? referenceValue : vals[0];
  const latest = vals[vals.length - 1];
  const tone = latest > baseline ? 'up' : (latest < baseline ? 'down' : 'flat');
  const referenceY = hasReference ? yFor(referenceValue) : null;
  const referenceLabelY = hasReference
    ? Math.max(pad.top + 12, Math.min(pad.top + plotH - 14, referenceY < pad.top + 20 ? referenceY + 14 : referenceY - 6))
    : null;
  const referenceLabel = hasReference ? _escapeMarketHtml(reference.label) : '';
  // The dashed reference line is labelled with what it represents ("Previous
  // close" on 1D, the period start on longer ranges) so the baseline the change
  // is measured against is never ambiguous. The value also drives the line
  // position and the chart's accessible aria-label below.
  // The line lives inside a preserveAspectRatio="none" SVG, which would stretch
  // any <text> horizontally — so the label is rendered as an HTML legend overlay
  // (see _renderMarketChartGraphic) rather than as SVG text.
  const referenceLine = hasReference
    ? `<g class="mkt-reference-line" aria-hidden="true" data-source="${_escapeMarketHtml(reference.source)}">
        <line x1="${pad.left}" y1="${referenceY.toFixed(1)}" x2="${(pad.left + plotW).toFixed(1)}" y2="${referenceY.toFixed(1)}"/>
      </g>`
    : '';
  _debugMarketHistory('hero_render_points', {
    asset: _currentAsset().symbol,
    range: _marketChart.range,
    interval: _marketChart.interval || '',
    returnedPointCount: Number(_marketChart.pointCount) || normalized.length,
    renderedPointCount: normalized.length,
    referenceLabel: reference?.label || '',
    referenceSource: reference?.source || '',
    referenceValue: hasReference ? referenceValue : null
  });
  console.log('[market chart points]', {
    asset: _currentAsset().symbol,
    timeframe: _marketChart.range,
    requestedInterval: _marketChart.interval || '',
    returnedPoints: Number(_marketChart.pointCount) || normalized.length,
    validPoints: normalized.length,
    renderedPoints: coords.length,
    firstTimestamp: normalized[0]?.time,
    lastTimestamp: normalized.at(-1)?.time
  });
  _marketChartView = {
    width: W,
    height: H,
    pad,
    plotW,
    plotH,
    baseline,
    reference: hasReference ? { ...reference, y: referenceY } : null,
    points: coords.map(([x, y, point]) => ({ x, y, value: point.value, time: point.time })),
  };
  return `
    <svg class="mkt-hero-chart ${tone}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${_escapeMarketHtml(`${_currentAsset().name} ${_marketChart.range} price chart. ${reference?.label || 'Period reference'}: ${hasReference ? _formatAssetValue(referenceValue) : 'unavailable'}.`)}">
      <defs>
        <linearGradient id="mktHeroFill" x1="0" y1="0" x2="0" y2="1">
          <stop class="mkt-hero-fill-top" offset="0"/>
          <stop class="mkt-hero-fill-bot" offset="1"/>
        </linearGradient>
      </defs>
      ${areaPaths.map(area => `<path class="mkt-hero-area" d="${area}" fill="url(#mktHeroFill)"/>`).join('')}
      ${referenceLine}
      ${linePaths.map(line => `<path class="mkt-hero-line" d="${line}" fill="none" vector-effect="non-scaling-stroke"/>`).join('')}
      <g class="mkt-crosshair" aria-hidden="true">
        <line class="mkt-crosshair-line" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}"/>
        <circle class="mkt-crosshair-dot" cx="0" cy="0" r="2.4"/>
        <text class="mkt-crosshair-label" x="0" y="${H - 4}" text-anchor="middle"></text>
      </g>
      <rect class="mkt-chart-scrub-layer" x="0" y="0" width="${W}" height="${H}" tabindex="0"
        onpointerdown="_startMarketChartScrub(event)"
        onpointermove="_moveMarketChartScrub(event)"
        onpointerup="_endMarketChartScrub(event)"
        onpointercancel="_endMarketChartScrub(event)"
        onpointerleave="_leaveMarketChartScrub(event)"
        onkeydown="_keyMarketChartScrub(event)"/>
    </svg>`;
}

function _nearestMarketChartPoint(svgX) {
  const view = _marketChartView;
  if (!view || !Array.isArray(view.points) || !view.points.length) return null;
  let best = view.points[0];
  let bestDist = Math.abs(svgX - best.x);
  for (let i = 1; i < view.points.length; i++) {
    const dist = Math.abs(svgX - view.points[i].x);
    if (dist < bestDist) {
      best = view.points[i];
      bestDist = dist;
    }
  }
  return best;
}

function _clientXToMarketSvgX(event) {
  const svg = document.querySelector('.mkt-hero-chart');
  if (!svg) return 0;
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return 0;
  const viewWidth = _marketChartView?.width || 600;
  const raw = ((Number(event?.clientX) || rect.left) - rect.left) / rect.width * viewWidth;
  return Math.max(0, Math.min(viewWidth, raw));
}

function _applyMarketCrosshairPoint(point) {
  if (!point || !_marketChartView) return;
  if (_marketScrubRestoreTimer) {
    clearTimeout(_marketScrubRestoreTimer);
    _marketScrubRestoreTimer = null;
  }
  const svg = document.querySelector('.mkt-hero-chart');
  const cross = svg?.querySelector('.mkt-crosshair');
  if (!svg || !cross) return;
  const line = cross.querySelector('.mkt-crosshair-line');
  const dot = cross.querySelector('.mkt-crosshair-dot');
  const label = cross.querySelector('.mkt-crosshair-label');
  const labelText = _formatMarketCrosshairTime(point.time);
  const labelX = Math.max(28, Math.min((_marketChartView.width || 600) - 28, point.x));
  cross.classList.add('show');
  if (line) {
    line.setAttribute('x1', point.x.toFixed(1));
    line.setAttribute('x2', point.x.toFixed(1));
  }
  if (dot) {
    dot.setAttribute('cx', point.x.toFixed(1));
    dot.setAttribute('cy', point.y.toFixed(1));
  }
  if (label) {
    label.textContent = labelText;
    label.setAttribute('x', labelX.toFixed(1));
  }
  const baseline = Number(_marketChartView.baseline) || Number(point.value) || 0;
  const change = Number(point.value) - baseline;
  const pct = baseline ? (change / baseline) * 100 : 0;
  _setMarketHeroDisplay(point.value, change, pct, _marketScrubPeriodText());
}

function _updateMarketChartScrub(event) {
  const point = _nearestMarketChartPoint(_clientXToMarketSvgX(event));
  if (point) _applyMarketCrosshairPoint(point);
}

// Lift the page-scroll lock and clear the active pointer. Safe to call more
// than once (release, cancel, blur, and the safety nets can all reach here).
function _unlockMarketChartScrub() {
  _marketScrubPointerId = null;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('market-chart-scrubbing');
  }
}

// Global safety nets: if a gesture is interrupted off the chart (the OS steals
// it, the tab is hidden, the window loses focus, or a stray pointerup lands
// elsewhere), force the lock off so normal scrolling is never left stuck on.
let _marketScrubSafetyBound = false;
function _bindMarketScrubSafetyNets() {
  if (_marketScrubSafetyBound || typeof window === 'undefined') return;
  _marketScrubSafetyBound = true;
  const release = () => {
    if (_marketScrubPointerId === null && !document.body?.classList.contains('market-chart-scrubbing')) return;
    _unlockMarketChartScrub();
    _marketScrubRestoreTimer = setTimeout(_restoreMarketHeroDisplay, 420);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('touchend', release);
  window.addEventListener('touchcancel', release);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}

function _startMarketChartScrub(event) {
  _bindMarketScrubSafetyNets();
  _marketScrubPointerId = Number.isInteger(event?.pointerId) ? event.pointerId : null;
  const target = event?.currentTarget;
  if (target && _marketScrubPointerId !== null && typeof target.setPointerCapture === 'function') {
    try { target.setPointerCapture(_marketScrubPointerId); } catch {}
  }
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  document.body.classList.add('market-chart-scrubbing');
  _updateMarketChartScrub(event);
}

function _moveMarketChartScrub(event) {
  if (_marketScrubPointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== _marketScrubPointerId) return;
  if (event?.pointerType === 'touch' && typeof event.preventDefault === 'function') event.preventDefault();
  if (_marketScrubPointerId !== null || event?.pointerType === 'mouse') _updateMarketChartScrub(event);
}

function _endMarketChartScrub(event) {
  if (_marketScrubPointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== _marketScrubPointerId) return;
  const target = event?.currentTarget;
  if (target && _marketScrubPointerId !== null && typeof target.releasePointerCapture === 'function') {
    try { target.releasePointerCapture(_marketScrubPointerId); } catch {}
  }
  _unlockMarketChartScrub();
  _marketScrubRestoreTimer = setTimeout(_restoreMarketHeroDisplay, 420);
}

function _leaveMarketChartScrub(event) {
  if (_marketScrubPointerId !== null) return;
  if (event?.pointerType === 'mouse') {
    _marketScrubRestoreTimer = setTimeout(_restoreMarketHeroDisplay, 260);
  }
}

function _hideMarketCrosshair() {
  const cross = document.querySelector('.mkt-crosshair');
  if (cross) cross.classList.remove('show');
}

function _keyMarketChartScrub(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event?.key)) return;
  const points = _marketChartView?.points || [];
  if (!points.length) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  const currentX = Number(document.querySelector('.mkt-crosshair-line')?.getAttribute('x1'));
  let index = Number.isFinite(currentX)
    ? points.findIndex(p => Math.abs(p.x - currentX) < 0.5)
    : points.length - 1;
  if (index < 0) index = points.length - 1;
  if (event.key === 'ArrowLeft') index = Math.max(0, index - 1);
  else if (event.key === 'ArrowRight') index = Math.min(points.length - 1, index + 1);
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = points.length - 1;
  _applyMarketCrosshairPoint(points[index]);
}

function _signedPlainNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

function _formatMarketLevel(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function _marketQuickTakeCopy(range = _marketChart.range, tone = _marketToneFromStats()) {
  const a = _currentAsset();
  const stats = _marketDisplayStats();
  const up = stats ? stats.pct >= 0 : tone !== 'down';
  const dir = up ? 'up' : 'down';
  const movePct = stats ? `${Math.abs(stats.pct).toFixed(2)}%` : '';
  const period = { '1D': 'today', '1W': 'this week', '1M': 'this month', '3M': 'over the last three months', 'YTD': 'so far this year', '1Y': 'over the past year', '5Y': 'over the past five years' }[range] || 'today';
  if (a.key === 'qqq') {
    const qqqTail = {
      '1D': up ? 'That usually points to stronger trading in many large growth and technology-heavy companies.' : 'That usually means many large growth and technology-heavy companies are trading lower.',
      '1W': up ? 'A stronger week can reflect improving expectations for large Nasdaq-100 companies.' : 'A weaker week can happen when investors cool on growth stocks or rate-sensitive companies.',
      '1M': up ? 'Monthly strength can show better sentiment toward large Nasdaq-100 companies.' : 'Monthly weakness can show investors becoming more cautious about growth and technology-heavy companies.',
      '3M': up ? 'A three-month gain can reflect sustained strength among many large Nasdaq-100 companies.' : 'A three-month decline can reflect pressure on large growth companies over the quarter.',
      'YTD': up ? 'A gain since January reflects how large Nasdaq-100 companies have traded across this calendar year so far.' : 'A decline since January shows large growth companies have been under pressure this calendar year so far.',
      '1Y': up ? 'A yearly gain often builds through many moves across the large companies QQQ tracks.' : 'A yearly decline shows that even major growth-focused ETFs can have long drawdowns.',
      '5Y': up ? 'A five-year gain reflects how long-term growth in large Nasdaq-100 companies can compound through many cycles.' : 'Even over five years, a growth-focused ETF can sit below an earlier peak after a major drawdown.'
    }[range] || 'QQQ tracks the Nasdaq-100, not every Nasdaq-listed company.';
    return `QQQ is ${dir} ${movePct} ${period}. QQQ is a Nasdaq-100 ETF. ${qqqTail}`.replace(/\s+/g, ' ').trim();
  }
  const tail = {
    '1D': up ? 'Daily moves mostly reflect short-term sentiment rather than lasting change.' : 'A single down day is usually noise, not a signal to act.',
    '1W': up ? 'A week of gains can reflect improving expectations around rates or earnings.' : 'Short-term dips are a normal part of how markets work.',
    '1M': up ? 'Monthly trends show how expectations can lift prices before the real economy changes.' : 'When optimism cools, prices can drift lower even on slow news.',
    '3M': up ? 'A few months of gains often come from steady earnings and resilience.' : 'Choppy quarters are a reminder that time horizon matters more than timing.',
    'YTD': up ? 'Year-to-date gains add up from many sessions since January, not one single day.' : 'A down year-to-date stretch is a normal part of how markets work over a calendar year.',
    '1Y': up ? 'A year of gains builds through many small moves, not one big jump.' : 'Longer periods can still include real drawdowns — diversification helps.',
    '5Y': up ? 'Five-year gains show how staying invested through ups and downs can compound over time.' : 'Even five-year stretches can end lower, a reminder that long horizons still carry risk.'
  }[range] || '';
  return `${a.name} is ${dir} ${movePct} ${period}. ${tail}`.replace(/\s+/g, ' ').trim();
}

function _renderMarketRangeToggle() {
  const toggle = MARKET_CHART_RANGES.map(r => `
    <button type="button" role="tab" class="mkt-range-btn${_marketChart.range === r ? ' is-active active' : ''}" aria-selected="${_marketChart.range === r ? 'true' : 'false'}" onclick="setMarketChartRange('${r}')">${r}</button>
  `).join('');
  return `<div class="mkt-range-toggle" role="tablist" aria-label="Chart range">${toggle}</div>`;
}

function _renderMarketChartGraphic() {
  let chartBody;
  let legend = '';
  if (_marketChart.status === 'ready' && _marketChartStats()) {
    chartBody = _buildHeroChartSvg(_marketChart.points);
    // HTML legend naming the dashed reference line ("Previous close" on 1D, the
    // period start on longer ranges). Kept out of the stretched SVG so the text
    // is never distorted, and rendered INSIDE the plot area (top-right) as a
    // small muted caption over a subtle translucent backing. pointer-events are
    // disabled so it can never intercept scrubbing or pointer interaction on the
    // chart beneath it.
    const ref = _marketReferenceForNormalized(_normalizeMarketChartPoints(_marketChart.points));
    if (ref && ref.label) {
      legend = `<div class="mkt-chart-legend" aria-hidden="true"><span class="mkt-chart-legend-dash"></span>${_escapeMarketHtml(ref.label)}</div>`;
    }
  } else if (_marketChart.status === 'error') {
    _marketChartView = null;
    chartBody = `<div class="mkt-hero-empty">Chart data unavailable right now.<button type="button" class="mkt-hero-retry" onclick="ensureMarketChart(true)">Try again</button></div>`;
  } else {
    _marketChartView = null;
    chartBody = `<div class="mkt-hero-loading"><span class="mc-spinner"></span></div>`;
  }
  return `<div class="mkt-chart-canvas">${chartBody}${legend}</div>`;
}

function _renderMarketAssetMenu() {
  const sel = _marketChart.asset;
  return `
    <div class="market-asset-menu${_marketAssetMenuOpen ? ' open' : ''}" id="marketAssetMenu" role="listbox" aria-label="Select a market">
      ${MARKET_ASSETS.map(a => `
        <button type="button" role="option" aria-selected="${a.key === sel ? 'true' : 'false'}" class="market-asset-option${a.key === sel ? ' is-selected' : ''}" onclick="selectMarketAsset('${a.key}')">
          <span class="market-asset-copy">
            <span class="market-asset-name">${_escapeMarketHtml(a.name)}</span>
            <span class="market-asset-desc">${_escapeMarketHtml(a.description || '')}</span>
          </span>
          <span class="market-asset-check" aria-hidden="true">${a.key === sel ? _marketThinIcon('check') : ''}</span>
        </button>
      `).join('')}
    </div>`;
}

function _renderMarketTodayHeroInner() {
  const a = _currentAsset();
  const stats = _marketDisplayStats();
  // On the daily view the headline reads the SAME normalized snapshot the cards
  // and recap use (regular-session price + previous regular close), so the three
  // can never disagree. Longer ranges describe the chart period itself, so they
  // keep using the chart's own first→last math.
  const snap = _marketChart.range === '1D' ? _normalizedMarketSnapshot(a.key) : null;
  const useSnap = !!(snap && snap.available && Number.isFinite(snap.percentChange));
  const tone = useSnap
    ? (snap.percentChange > 0 ? 'up' : snap.percentChange < 0 ? 'down' : 'flat')
    : _marketToneFromStats(stats);
  const priceText = useSnap ? _formatAssetValue(snap.currentPrice) : (stats ? _formatAssetValue(stats.last) : '—');
  const pctText = useSnap
    ? _formatSignedPctClean(snap.percentChange)
    : (stats ? _formatSignedPctClean(stats.pct) : '—');
  const changeText = useSnap
    ? (Number.isFinite(snap.absoluteChange) ? _formatAssetChange(snap.absoluteChange) : '—')
    : (stats ? _formatAssetChange(stats.change) : '—');
  return `
    <div class="market-v3-hero-copy">
      <div class="market-v3-index-select">
        <button type="button" class="market-v3-index-label" id="marketAssetLabel" aria-haspopup="listbox" aria-expanded="${_marketAssetMenuOpen ? 'true' : 'false'}" aria-label="Selected market: ${_escapeMarketHtml(a.name)}. Change market." onclick="toggleMarketAssetMenu(event)">${_escapeMarketHtml(a.name)} <span class="${_marketAssetMenuOpen ? 'is-open' : ''}">⌄</span></button>
        ${_renderMarketAssetMenu()}
      </div>
      ${a.badge ? `<div class="market-v3-index-sub">${_escapeMarketHtml(a.badge)}</div>` : ''}
      ${_marketHeroStatusLine()}
      <h1 class="market-v3-index-value" id="marketHeroValue">${_escapeMarketHtml(priceText)}</h1>
      <div class="market-v3-change-line">
        <span class="market-v3-change ${tone}" id="marketHeroChange">${_escapeMarketHtml(changeText)} (${_escapeMarketHtml(pctText)})</span>
        <span class="market-v3-change-context" id="marketHeroChangeContext">${_escapeMarketHtml(_marketChangeContextLabel())}</span>
      </div>
    </div>
    ${_renderMarketChartGraphic()}
    ${_renderMarketRangeToggle()}`;
}

function _marketChangePeriodWord() {
  return { '1D': 'today', '1W': 'this week', '1M': 'this month', '3M': '3 months', 'YTD': 'year to date', '1Y': 'over the past year', '5Y': '5 years' }[_marketChart.range] || 'today';
}

// Small contextual label clarifying that the large headline change reflects the
// SELECTED range, not just today, on every range except 1D ("Today").
function _marketChangeContextLabel() {
  return {
    '1D': 'Today',
    '1W': '1-week change',
    '1M': '1-month change',
    '3M': '3-month change',
    'YTD': 'YTD change',
    '1Y': '1-year change',
    '5Y': '5-year change'
  }[String(_marketChart.range || '1D').toUpperCase()] || 'Today';
}

// Compact "Market open · Updated 1:41 PM ET" line shown beneath the headline.
// Reuses the real session status for the selected asset and the live snapshot
// timestamp — never hardcoded. The status dot colour follows the same tones.
function _marketHeroStatusLine() {
  const status = _getAssetMarketStatus(_currentAsset());
  const phraseBySession = {
    open: 'Market open',
    premarket: 'Pre-market',
    afterhours: 'After-hours',
    closed: 'Market closed',
    crypto: 'Trading 24/7'
  };
  const phrase = phraseBySession[status.session] || status.label || '';
  const ts = _marketRecapTimestamp();
  const updated = ts ? `Updated ${ts} ET` : '';
  const text = [phrase, updated].filter(Boolean).join(' · ');
  if (!text) return '';
  return `
    <div class="market-v3-status" id="marketHeroStatus">
      <span class="market-v3-status-dot market-v3-status-dot-${status.tone}" aria-hidden="true"></span>
      <span>${_escapeMarketHtml(text)}</span>
    </div>`;
}

// ── Asset selector (compact dropdown beneath the label) ─────────────
function toggleMarketAssetMenu(event) {
  if (event) event.stopPropagation();
  _marketAssetMenuOpen = !_marketAssetMenuOpen;
  _repaintMarketHero();
  if (_marketAssetMenuOpen) {
    setTimeout(() => {
      document.addEventListener('click', _onMarketAssetDocClick, true);
      document.addEventListener('keydown', _onMarketAssetKey, true);
    }, 0);
  } else {
    _detachMarketAssetMenu();
  }
}
function _repaintMarketHero() {
  const hero = document.getElementById('marketTodayHero');
  if (hero) hero.innerHTML = _renderMarketTodayHeroInner();
}
function _onMarketAssetDocClick(e) {
  const menu = document.getElementById('marketAssetMenu');
  const label = document.getElementById('marketAssetLabel');
  if (menu && !menu.contains(e.target) && label && !label.contains(e.target)) closeMarketAssetMenu();
}
function _onMarketAssetKey(e) {
  if (e.key === 'Escape') {
    closeMarketAssetMenu();
    const label = document.getElementById('marketAssetLabel');
    if (label) label.focus();
  }
}
function _detachMarketAssetMenu() {
  document.removeEventListener('click', _onMarketAssetDocClick, true);
  document.removeEventListener('keydown', _onMarketAssetKey, true);
}
function closeMarketAssetMenu() {
  if (!_marketAssetMenuOpen) return;
  _marketAssetMenuOpen = false;
  _detachMarketAssetMenu();
  _repaintMarketHero();
}
function selectMarketAsset(key) {
  const a = _marketAssetByKey(key);
  const changed = a.key !== _marketChart.asset;
  closeMarketAssetMenu();
  if (changed) {
    _marketChart.asset = a.key;
    try { localStorage.setItem(MARKET_ASSET_KEY, a.key); } catch {}
    // New asset must fetch its OWN chart data (no stale reuse). Keep the range.
    _marketChart.points = [];
    _marketChart.marketOpen = null;
    _marketChart.previousClose = null;
    _marketChart.interval = '';
    _marketChart.pointCount = 0;
    _marketChartView = null;
    _marketChart.status = 'loading';
    _paintMarketChart();
    _paintMarketInsight();
    _paintMarketWatchlist();
    ensureMarketChart(true);
  }
  const label = document.getElementById('marketAssetLabel');
  if (label) label.focus();
}

function _marketThinIcon(kind) {
  const icons = {
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V22h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2v-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V2h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 3 7-9"/><path d="M16 6h4v4"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5h7a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4z"/><path d="M20 5h-5a3 3 0 0 0-3 3v11a3 3 0 0 1 3-3h5z"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2z"/></svg>',
    question: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.8 2.8 0 1 1 4.5 2.2c-1.2.8-2 1.5-2 2.8"/><path d="M12 18h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    cap: '<svg viewBox="0 0 24 24"><path d="M3 9l9-5 9 5-9 5z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/><path d="M21 9v6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h13"/><path d="M12 6l6 6-6 6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22c4 0 7-2.7 7-6.8 0-2.8-1.5-5.1-4.5-7.2.1 2.4-.9 3.7-2.3 4.5.2-3.1-1-5.4-3.4-7.5.2 4.5-3.8 6.2-3.8 10.2C5 19.3 8 22 12 22z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
  };
  return icons[kind] || icons.spark;
}

function _marketSelectedContext() {
  const a = _currentAsset();
  const stats = _marketDisplayStats();
  const range = _marketChart.range;
  const tone = _marketToneFromStats(stats);
  const lines = [];
  if (typeof _marketTutorContext === 'function') lines.push(_marketTutorContext().text);
  lines.push(`Selected market: ${a.name} (${a.symbol})`);
  lines.push(`Asset type: ${a.type || a.kind || 'market asset'}`);
  if (a.tracks) lines.push(`Tracks: ${a.tracks}`);
  if (a.description) lines.push(`Asset description: ${a.description}`);
  lines.push(`Selected timeframe: ${range}`);
  lines.push(`${a.name} selected-period tone: ${tone}`);
  lines.push(`Chart status: ${_marketChart.status || 'unknown'}`);
  lines.push(`Chart point count: ${Number(_marketChart.pointCount || (_marketChart.points || []).length) || 0}`);
  if (stats) {
    lines.push(`${a.name} selected-period value: ${_formatAssetValue(stats.last)}`);
    lines.push(`${a.name} selected-period change: ${_formatAssetChange(stats.change)} (${_formatSignedPctClean(stats.pct)})`);
  }
  lines.push(`Current Quick Take: ${_marketQuickTakeCopy(range, tone)}`);
  return lines.filter(Boolean).join('\n');
}

function _marketCreateFreshChat(title) {
  if (!window.ChatStore || typeof window.ChatStore.create !== 'function') return null;
  const chat = window.ChatStore.create();
  chat.title = String(title || 'Today’s Market').trim().slice(0, 60) || 'Today’s Market';
  if (typeof window.ChatStore.setActive === 'function') window.ChatStore.setActive(chat.id, { silent: true });
  if (typeof window.ChatStore.persist === 'function') window.ChatStore.persist();
  return chat;
}

function _marketActionTitle(action, asset) {
  const subj = asset?.name || 'Today’s Market';
  if (action === 'why') return `Why Did ${subj === 'S&P 500' ? 'the ' : ''}${subj} Move?`;
  if (action === 'learn') return `What ${subj}’s Move Means`;
  if (action === 'simple') return `Understanding ${subj}’s Move`;
  if (action === 'quiz') return `${subj} Market Quiz`;
  if (action === 'build') return `Lesson From Today’s Market`;
  return `${subj} Market Question`;
}

function _marketAssetPhrase(asset) {
  const name = asset?.name || 'market';
  return name === 'S&P 500' ? `the ${name}` : name;
}

function _marketActionRequest(action) {
  const a = _currentAsset();
  const range = _marketChart.range;
  const tone = _marketToneFromStats();
  const context = _marketSelectedContext();
  const subj = a.name;
  const phrase = _marketAssetPhrase(a);
  const period = range === '1D' ? 'today' : `over ${range}`;
  const visibleMessage = {
    why: `Why did ${phrase} move today?`,
    learn: `What should I learn from ${phrase}’s move?`,
    simple: `Explain ${phrase}’s move more simply.`,
    quiz: `Quiz me on today’s ${subj} move.`,
    build: `Build a lesson from today’s ${subj} move.`
  }[action] || `Explain ${subj}`;
  const apiPrompt = {
    why: `Why did ${subj} move ${period}? Use the supplied hidden market context. Keep it simple and educational. Do not mention raw market API data or hidden context.`,
    learn: `What should a beginner learn from ${subj}'s move ${period}? Use the supplied hidden market context. Give the key concept, not financial advice.`,
    simple: `Explain only ${subj}'s move ${period} in simpler beginner language. Use the supplied hidden market context without exposing it.`,
    quiz: `Create a short beginner quiz on the concepts behind ${subj} being ${tone} ${period}. Use the supplied hidden market context without exposing it.`,
    build: `Build a lesson from ${subj}'s move ${period}. Focus on the concepts behind ${subj} being ${tone}. Use the supplied hidden market context without exposing it.`
  }[action] || `Explain ${subj} in simple terms.`;
  return { asset: a, action, visibleMessage, apiPrompt, context, title: _marketActionTitle(action, a) };
}

function _startMarketChatFlow(request) {
  if (!request) return;
  _marketCreateFreshChat(request.title);
  if (typeof recordAskedTopic === 'function') recordAskedTopic(request.visibleMessage);
  if (typeof showCoach === 'function') showCoach({ resetScroll: true });
  setTimeout(() => {
    if (window.CoachPage?.ask) {
      const hiddenApiContext = Object.assign({
        source: 'market_action',
        action: request.action,
        selectedAsset: request.asset?.name || '',
        selectedTimeframe: _marketChart.range,
        fullPrompt: request.apiPrompt
      }, request.apiContext || {});
      const opts = {
        userLabel: request.visibleMessage,
        requestText: request.apiPrompt,
        topic: hiddenApiContext.topic || request.asset?.name || 'Today’s market',
        context: request.context,
        apiContext: hiddenApiContext,
        source: hiddenApiContext.source || 'market_action',
        marketTopic: hiddenApiContext.topic || request.asset?.name || 'Today’s market'
      };
      if (request.action === 'quiz') window.CoachPage.ask(request.asset?.name || 'today’s market', Object.assign(opts, { intent: 'quiz' }));
      else if (request.action === 'build') window.CoachPage.ask(`today’s ${request.asset?.name || 'market'} move`, Object.assign(opts, { intent: 'build', commitBeforeDepth: true }));
      else if (request.action === 'simple') window.CoachPage.ask(request.visibleMessage, Object.assign(opts, { intent: 'chat', responseMode: 'simple' }));
      else window.CoachPage.ask(request.visibleMessage, Object.assign(opts, { intent: 'chat' }));
    } else if (typeof openAskFinLingo === 'function') {
      openAskFinLingo('market');
    }
  }, 120);
}

function _marketAskAction(action) {
  _marketAskExpanded = false;
  _marketAskSheetOpen = false;
  _paintMarketAsk();
  _paintMarketAskSheet();
  _startMarketChatFlow(_marketActionRequest(action));
}

// Lowercase a topic title for use inside a sentence, while keeping common
// finance acronyms/tickers upper-cased (ETF, QQQ, S&P, IPO, …).
function _marketTopicLabelText(topic) {
  const title = String(topic || '').trim();
  if (!title) return 'this market topic';
  const keepUpper = /^(etf|etfs|ipo|ipos|s&p|qqq|spy|us|gdp|cpi|fed|ai|ira|iras|401k|esg|reit|reits)$/i;
  return title.split(/\s+/).map(word => {
    const bare = word.replace(/[^a-z0-9&]/gi, '');
    return keepUpper.test(bare) ? word.toUpperCase() : word.toLowerCase();
  }).join(' ');
}

// The VISIBLE user bubble. Keep it short and natural — "Explain risk-off
// markets." — and let the hidden context/apiPrompt carry the market connection
// so the question never reads as repetitive or auto-generated.
function _marketTopicDisplayMessage(topic, asset = _currentAsset()) {
  return `Explain ${_marketTopicLabelText(topic)}.`;
}

function _marketTopicApiContext(topic, apiPrompt) {
  const asset = _currentAsset();
  return {
    source: 'market_topic',
    topic: String(topic?.title || topic || '').trim(),
    topicSubtitle: String(topic?.sub || '').trim(),
    selectedAsset: asset.name,
    assetType: asset.type || asset.kind || '',
    tracks: asset.tracks || '',
    selectedTimeframe: _marketChart.range,
    marketContext: _marketSelectedContext(),
    fullPrompt: apiPrompt
  };
}

function _marketTopicAsk(topic, displayMessage, apiPrompt, apiContext) {
  _startMarketChatFlow({
    asset: _currentAsset(),
    action: 'topic',
    visibleMessage: displayMessage,
    apiPrompt,
    context: apiContext?.marketContext || _marketSelectedContext(),
    title: window.ChatStore?.titleFromQuestion ? window.ChatStore.titleFromQuestion(displayMessage) : displayMessage,
    apiContext
  });
}

function openMarketAskSheet() {
  _marketAskSheetOpen = true;
  _paintMarketAskSheet();
}

function closeMarketAskSheet() {
  _marketAskSheetOpen = false;
  _paintMarketAskSheet();
}

function _renderMarketAskSheet() {
  const options = [
    ['why', 'chart', 'Why did stocks move today?'],
    ['learn', 'book', 'What should I learn from this?'],
    ['simple', 'bulb', 'Explain it simpler'],
    ['quiz', 'question', "Quiz me on today’s market"],
    ['build', 'cap', "Build a lesson from today’s market"]
  ];
  return `
    <div class="market-ask-sheet-layer${_marketAskSheetOpen ? ' open' : ''}" id="marketAskSheetLayer" aria-hidden="${_marketAskSheetOpen ? 'false' : 'true'}">
      <button type="button" class="market-ask-sheet-backdrop" onclick="closeMarketAskSheet()" aria-label="Close market questions"></button>
      <section class="market-ask-sheet" role="dialog" aria-modal="true" aria-label="Ask about today’s market">
        <div class="market-ask-sheet-handle" aria-hidden="true"></div>
        <h2>What would you like to know?</h2>
        <div class="market-ask-sheet-options">
          ${options.map(([key, icon, label]) => `
            <button type="button" onclick="_marketAskAction('${key}')">
              <span>${_marketThinIcon(icon)}</span>
              ${_escapeMarketHtml(label)}
            </button>
          `).join('')}
        </div>
      </section>
    </div>`;
}

function _paintMarketAskSheet() {
  const layer = document.getElementById('marketAskSheetSlot');
  if (layer) layer.innerHTML = _renderMarketAskSheet();
}

// Inline accordion (no bottom sheet / overlay). Expanding pushes the content
// below it down; options are asset-aware and pass context into Ask.
// (Dormant: retained for the bottom-sheet path; not rendered on the Market page.)
function _renderMarketV3Actions() {
  // A calm, intentional Ask section: a small heading + supporting line, a single
  // always-visible input (static placeholder, real caret only on focus), and
  // three tappable suggestion chips. Suggestions submit their literal text, so
  // what is shown is exactly what is asked. Every path hands off through the
  // existing Ask flow (_marketAskSubmitText) — the ONLY point we navigate away.
  const suggestions = [
    'Why did Bitcoin move?',
    'Explain today simply',
    'What should I watch?'
  ];
  return `
    <section class="market-v3-actions">
      <div class="market-ask-head">
        <span class="market-ask-head-icon" aria-hidden="true">${_marketThinIcon('spark')}</span>
        <div class="market-ask-head-copy">
          <h2>Ask FinLingo</h2>
          <p class="market-ask-sub">Understand what moved and why.</p>
        </div>
      </div>
      <form class="market-ask-form" onsubmit="return submitMarketAskInput(event)">
        <input id="marketAskInput" class="market-ask-input" type="text" inputmode="text" autocomplete="off" placeholder="${_escapeMarketHtml(MARKET_ASK_PLACEHOLDER)}" aria-label="Ask about today's market" />
        <button type="submit" class="market-ask-input-send" aria-label="Send question">${_marketThinIcon('send')}</button>
      </form>
      <div class="market-ask-chips" role="group" aria-label="Suggested questions">
        ${suggestions.map(label => `
          <button type="button" class="market-ask-chip" onclick="_marketAskSubmitText('${_marketAskAttr(label)}')">${_escapeMarketHtml(label)}</button>
        `).join('')}
      </div>
    </section>`;
}

// Escape a string for safe inclusion inside a single-quoted inline onclick.
function _marketAskAttr(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Submit a market question (suggested or free text). Collapses the accordion and
// hands off to the shared chat flow — the ONLY point at which we navigate to Ask.
function _marketAskSubmitText(text) {
  const q = String(text || '').trim();
  if (!q) return;
  _marketAskExpanded = false;
  _paintMarketAsk();
  const a = _currentAsset();
  _startMarketChatFlow({
    asset: a,
    action: 'ask',
    visibleMessage: q,
    apiPrompt: `${q}\n\nAnswer for a beginner in plain English about today’s market. Use the supplied hidden market context without exposing it or mentioning internal instructions. Keep it educational and not financial advice.`,
    context: _marketSelectedContext(),
    title: window.ChatStore?.titleFromQuestion ? window.ChatStore.titleFromQuestion(q) : q
  });
}

function submitMarketAskInput(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const input = document.getElementById('marketAskInput');
  const val = input ? input.value : '';
  if (!String(val).trim()) { if (input) input.focus(); return false; }
  _marketAskSubmitText(val);
  return false;
}

function toggleMarketAsk() {
  _marketAskExpanded = !_marketAskExpanded;
  _paintMarketAsk();
}
// The Market-page Ask section is dormant (no #marketActionsSlot is rendered on
// the Market page), so this is a no-op. Kept so any dormant Ask-flow caller can
// still call it safely. (Shared Ask logic used by other pages — coachPage,
// navDrawer, chats — is untouched.)
function _paintMarketAsk() {}

// ── Ask control static prompt ───────────────────────────────────────
// The collapsed Ask control always shows the complete prompt phrase. There is
// no per-character typewriter: rotating/typing animation could leave clipped
// fragments like "Why d" on screen, so the text is rendered whole and steady
// (the blinking caret in CSS keeps the live-prompt feel).
const MARKET_ASK_PLACEHOLDER = 'Ask about today’s market…';

function _marketReducedMotion() {
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function _startMarketAskTypewriter() {
  const el = document.getElementById('marketAskExampleText');
  if (!el) return;
  // Always render the complete prompt phrase — never a mid-typed fragment.
  el.textContent = MARKET_ASK_PLACEHOLDER;
}

// Retained as a no-op so existing teardown call sites stay valid; there is no
// animation timer left to clear.
function _stopMarketAskTypewriter() {}

// Tear the loop down whenever the user leaves the Market screen.
try {
  window.addEventListener('finlingo:screen-changed', function (event) {
    if (event?.detail?.id !== 'marketScreen') _stopMarketAskTypewriter();
  });
} catch (_) {}

const MARKET_V3_TOPICS = [
  { title: 'Interest rates', sub: 'What moves them' },
  { title: 'Inflation', sub: 'Data and impact' },
  { title: 'Earnings season', sub: 'What to watch' }
];

function _topicSupportLine(title) {
  const t = String(title || '').toLowerCase();
  if (t.includes('rate')) return 'What moves them';
  if (t.includes('inflation')) return 'Data and impact';
  if (t.includes('earning')) return 'What to watch';
  if (t.includes('volatility')) return 'Price swings';
  if (t.includes('diversification')) return 'Spread risk';
  if (t.includes('bond')) return 'Rates and prices';
  if (t.includes('etf')) return 'Market baskets';
  return 'Market concept';
}

// Short, plain-English subtitles for the concepts the recap can surface.
const MARKET_RECAP_CONCEPT_SUB = {
  'Risk-off markets': 'Why assets fall together',
  'Market correlation': 'Why assets diverge',
  'Technology-stock concentration': 'Big names, big weight',
  'Volatility': 'Sharp price swings',
  'Investor sentiment': 'The market’s mood',
  'Diversification': 'Spreading risk'
};
// Compact card titles where the canonical concept name is too long for a chip.
const MARKET_RECAP_CONCEPT_TITLE = {
  'Technology-stock concentration': 'Tech concentration',
  'Market correlation': 'Correlation'
};

// Collapse semantically overlapping topic titles to one canonical key so the
// grid never renders near-duplicates like "Market correlation" + "Correlation"
// or "Technology-stock concentration" + "Tech concentration" side by side.
function _marketTopicCanonKey(title) {
  const t = String(title || '').toLowerCase();
  if (t.includes('correlation')) return 'correlation';
  if (t.includes('tech')) return 'tech-concentration';
  if (t.includes('rate')) return 'rates';
  if (t.includes('inflation')) return 'inflation';
  if (t.includes('volatil')) return 'volatility';
  if (t.includes('diversif')) return 'diversification';
  if (t.includes('risk-off')) return 'risk-off';
  if (t.includes('sentiment')) return 'sentiment';
  if (t.includes('earning')) return 'earnings';
  return t.trim();
}

// A short, quiet metadata label for a topic card — the third line in the
// title → description → metadata hierarchy. Keyed off the same canonical key the
// grid dedupes on, so it stays correct as the dynamic topics change.
function _marketTopicMeta(title) {
  const map = {
    correlation: 'Stocks vs. BTC',
    'tech-concentration': 'Index risk',
    rates: 'Fed · inflation',
    inflation: 'Prices · CPI',
    earnings: 'Company profits',
    volatility: 'Risk gauge',
    diversification: 'Spread risk',
    'risk-off': 'Caution mode',
    sentiment: 'Market mood'
  };
  return map[_marketTopicCanonKey(title)] || 'Market concept';
}

// Topics now track today's tape: they lead with the concept the recap is
// teaching and add themes implied by how the gauges actually moved, then fall
// back to evergreen basics. We never invent a cause — only name concepts the
// price action supports.
function _getMarketV3Topics() {
  const movers = _marketRecapMovers();
  const avail = movers.filter(m => m.available);
  const topics = [];
  const seenKeys = new Set();
  const push = (title, sub) => {
    const t = String(title || '').trim();
    if (!t) return;
    const key = _marketTopicCanonKey(t);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    topics.push({ title: t, sub: String(sub || '').trim() });
  };

  if (avail.length >= 2) {
    const by = sym => movers.find(m => m.symbol === sym);
    const spy = by('SPY'), qqq = by('QQQ'), btc = by('BTC');
    const mag = m => (m && m.available ? Math.abs(m.pct) : 0);
    const ups = avail.filter(m => m.tone === 'up').length;
    const downs = avail.filter(m => m.tone === 'down').length;

    // Lead with what the recap is teaching today.
    const learn = _marketRecapLearn(movers);
    push(
      MARKET_RECAP_CONCEPT_TITLE[learn.name] || learn.name,
      MARKET_RECAP_CONCEPT_SUB[learn.name] || _topicSupportLine(learn.name)
    );

    if (downs === avail.length) push('Risk-off markets', MARKET_RECAP_CONCEPT_SUB['Risk-off markets']);
    else if (ups === avail.length) push('Investor sentiment', MARKET_RECAP_CONCEPT_SUB['Investor sentiment']);
    if (spy?.available && btc?.available && spy.tone !== 'flat' && btc.tone !== 'flat' && spy.tone !== btc.tone) {
      push('Correlation', MARKET_RECAP_CONCEPT_SUB['Market correlation']);
    }
    if (qqq?.available && spy?.available && (mag(qqq) - mag(spy)) >= 0.4) {
      push('Tech concentration', MARKET_RECAP_CONCEPT_SUB['Technology-stock concentration']);
    }
    if (Math.max(mag(spy), mag(qqq), mag(btc)) >= 1.5) {
      push('Volatility', MARKET_RECAP_CONCEPT_SUB['Volatility']);
    }
  }

  // Evergreen fillers so there are always three concise, useful topics.
  MARKET_V3_TOPICS.forEach(t => push(t.title, t.sub));
  push('Diversification', MARKET_RECAP_CONCEPT_SUB['Diversification']);
  return topics.slice(0, 3);
}

function _marketTopicPrompt(topic) {
  const title = String(topic?.title || 'today’s market').trim();
  const sub = String(topic?.sub || '').trim();
  const asset = _currentAsset();
  const range = _marketChart.range;
  const stats = _marketDisplayStats();
  const tone = _marketToneFromStats(stats);
  const assetName = asset.name;
  const lower = title.toLowerCase();
  let focus;
  if (lower.includes('inflation')) {
    focus = asset.key === 'qqq'
      ? `Explain how inflation expectations can affect QQQ, the Nasdaq-100 companies it tracks, valuations, and earnings expectations over ${range}.`
      : asset.kind === 'crypto'
      ? `Explain how inflation expectations can affect risk appetite and Bitcoin over ${range}.`
      : `Explain how inflation expectations can affect ${assetName}, company valuations, and earnings expectations over ${range}.`;
  } else if (lower.includes('rate')) {
    focus = asset.key === 'qqq'
      ? `Explain how interest rates may influence QQQ, growth stocks, discount rates, and the Nasdaq-100 companies it tracks over ${range}.`
      : asset.kind === 'crypto'
      ? `Explain how interest rates may influence risk assets and Bitcoin over ${range}.`
      : `Explain how interest rates may influence stock prices, discount rates, and earnings expectations for ${assetName} over ${range}.`;
  } else if (lower.includes('bond')) {
    focus = asset.key === 'qqq'
      ? `Explain bonds as a general finance topic and connect bond yields to risk appetite, growth stocks, and QQQ over ${range}.`
      : `Explain bonds as a general finance topic and connect bond yields to risk appetite and ${assetName} over ${range}.`;
  } else if (lower.includes('earning')) {
    focus = asset.key === 'qqq'
      ? `Explain earnings season and what beginners should watch when QQQ and the Nasdaq-100 companies it tracks are ${tone} over ${range}.`
      : asset.kind === 'crypto'
      ? `Explain earnings season as a stock-market topic and why it can still influence broader risk appetite around Bitcoin over ${range}.`
      : `Explain earnings season and what beginners should watch when ${assetName} is ${tone} over ${range}.`;
  } else {
    focus = `Explain ${title} in plain English and connect it to ${assetName} over ${range}.`;
  }
  return [
    `${focus} Make it beginner-friendly, educational, and not financial advice. Answer in 2-4 short paragraphs. Do not mention supplied context or internal instructions.`,
    sub ? `Topic detail: ${sub}.` : '',
    _marketSelectedContext()
  ].filter(Boolean).join('\n\n');
}

function askMarketTopic(index) {
  const topic = _getMarketV3Topics()[index];
  if (!topic) return;
  const displayMessage = _marketTopicDisplayMessage(topic.title);
  const apiPrompt = _marketTopicPrompt(topic);
  const apiContext = _marketTopicApiContext(topic, apiPrompt);
  _marketTopicAsk(topic.title, displayMessage, apiPrompt, apiContext);
}

function _renderMarketV3Topics() {
  return `
    <section class="market-v3-topics">
      <div class="market-v3-section-row">
        <h2><span class="market-v3-section-fire" aria-hidden="true">${_marketThinIcon('flame')}</span>Today’s Key Topics</h2>
      </div>
      <div class="market-v3-topic-grid">
        ${_getMarketV3Topics().map((topic, index) => `
          <button type="button" class="market-v3-topic-card" onclick="askMarketTopic(${index})">
            <span class="market-v3-topic-head">
              <strong class="market-v3-topic-title">${_escapeMarketHtml(topic.title)}</strong>
              <span class="market-v3-topic-arrow" aria-hidden="true">${_marketThinIcon('chevron')}</span>
            </span>
            <small>${_escapeMarketHtml(topic.sub)}</small>
            <span class="market-v3-topic-meta">${_escapeMarketHtml(_marketTopicMeta(topic.title))}</span>
          </button>
        `).join('')}
      </div>
    </section>`;
}

// ── End-of-Day Recap ────────────────────────────────────────────────
// A concise, educational market recap that sits below Today's Key Topics.
// It reuses the live snapshot quotes (no new fetches) and never invents a
// cause, an event, or a statistic. Honest about availability and staleness.
const MARKET_RECAP_MOVERS = [
  { key: 'sp500', symbol: 'SPY', name: 'S&P 500' },
  { key: 'qqq', symbol: 'QQQ', name: 'QQQ' },
  { key: 'btc', symbol: 'BTC', name: 'Bitcoin' }
];

function _marketRecapMovers() {
  return MARKET_RECAP_MOVERS.map(m => {
    // Same normalized snapshot the graph header reads, so the recap's % can
    // never differ from the headline change for the same asset.
    const snap = _normalizedMarketSnapshot(m.key);
    const pct = Number(snap.percentChange);
    const available = snap.available && Number.isFinite(pct);
    return {
      name: m.name,
      symbol: m.symbol,
      key: m.key,
      pct: available ? pct : null,
      tone: !available ? 'flat' : pct > 0.0005 ? 'up' : pct < -0.0005 ? 'down' : 'flat',
      available
    };
  });
}

// Recommend one concept from the allowed list, chosen to match the displayed
// movements. We never recommend yields/rates here because no Treasury data is
// shown in this recap.
function _marketRecapLearn(movers = _marketRecapMovers()) {
  const by = sym => movers.find(m => m.symbol === sym);
  const spy = by('SPY'), qqq = by('QQQ'), btc = by('BTC');
  const avail = movers.filter(m => m.available);
  const mag = m => (m && m.available ? Math.abs(m.pct) : 0);
  const downs = avail.filter(m => m.tone === 'down').length;
  const ups = avail.filter(m => m.tone === 'up').length;

  // Everything fell together → risk-off.
  if (avail.length >= 2 && downs === avail.length) {
    return { name: 'Risk-off markets', why: 'Learn why stocks and speculative assets sometimes decline together when investors become more cautious.' };
  }
  // Stocks and Bitcoin split → correlation.
  if (spy?.available && btc?.available && spy.tone !== 'flat' && btc.tone !== 'flat' && spy.tone !== btc.tone) {
    return { name: 'Market correlation', why: 'Learn why different assets sometimes move together and other times pull apart.' };
  }
  // Tech leading the move → tech concentration.
  if (qqq?.available && spy?.available && (mag(qqq) - mag(spy)) >= 0.4) {
    return { name: 'Technology-stock concentration', why: 'Learn how heavily a handful of technology names can weigh on the broad index.' };
  }
  // Any outsized single move → volatility.
  if (Math.max(mag(spy), mag(qqq), mag(btc)) >= 1.5) {
    return { name: 'Volatility', why: 'Learn what it means when prices swing sharply in a single session.' };
  }
  // Everything rose together → sentiment.
  if (avail.length >= 2 && ups === avail.length) {
    return { name: 'Investor sentiment', why: 'Learn how the mood of investors can lift stocks and speculative assets at the same time.' };
  }
  // Mixed / quiet → diversification.
  return { name: 'Diversification', why: 'Learn how holding assets that don’t always move together can steady a portfolio.' };
}

// Eastern time, to match the U.S. market session the recap describes.
function _marketRecapTimestamp() {
  const at = Number(_marketSnapshot.fetchedAt);
  if (!Number.isFinite(at) || at <= 0) return '';
  try {
    return new Date(at).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

// ── Market insight ──────────────────────────────────────────────────
// One connected module sitting directly beneath the chart: a single plain-
// English summary of the SELECTED asset, what to watch, and one learning
// next-step. It reuses the same live snapshot the headline reads, so nothing
// can disagree, and it never repeats the headline percentage in prose.

// Small metadata line beneath the learning action.
function _marketLessonMeta() {
  return '4 min · Beginner';
}

// ── Range-aware phrasing ────────────────────────────────────────────
// Every piece of insight copy keys off the SELECTED range. Only 1D uses
// "today"; longer ranges describe their own period so we never imply a single
// session covers a multi-month move.
function _marketRangePhrase(range = _marketChart.range) {
  return {
    '1D': 'today',
    '1W': 'over the past week',
    '1M': 'over the past month',
    '3M': 'over the past three months',
    'YTD': 'year to date',
    '1Y': 'over the past year',
    '5Y': 'over the past five years'
  }[String(range || '1D').toUpperCase()] || 'over this period';
}
function _marketRangeHorizon(range = _marketChart.range) {
  return {
    '1D': 'over the next few sessions',
    '1W': 'in the days ahead',
    '1M': 'in the weeks ahead',
    '3M': 'in the months ahead',
    'YTD': 'through the rest of the year',
    '1Y': 'in the year ahead',
    '5Y': 'over the long term'
  }[String(range || '1D').toUpperCase()] || 'in the period ahead';
}

// ── Asset-specific Market insight ───────────────────────────────────
// The Market insight ALWAYS describes the SELECTED asset only. On 1D it reads
// the live daily snapshot for that asset; on longer ranges it reads the chart's
// own first→last return. It never names another asset and never infers one
// asset's move from another — the only place the page compares assets is the
// grounded Today's Key Topics, never this prose. Copy wording is keyed to the
// instrument "flavor" (broad index ETF, tech index ETF, crypto, or yield) so a
// rate move is described with rate language and a crypto move with crypto
// language. Direction and magnitude come only from real data; when that data
// isn't available we say so rather than guess.

// Classify the selected asset into a copy "flavor".
function _marketAssetFlavor(asset = _currentAsset()) {
  if (asset.kind === 'crypto') return 'crypto';
  if (asset.kind === 'yield') return 'yield';
  if (asset.key === 'qqq') return 'tech';
  return 'broad';
}

// Sentence-subject for the selected asset, capitalized (sentence-leading) and
// lowercased (mid-sentence), with the right article. SPY/QQQ/BTC each read as
// the instrument the page actually shows; a yield reads as the rate.
function _marketAssetSubject(asset = _currentAsset()) {
  if (asset.kind === 'yield') return 'The 10-year Treasury yield';
  if (asset.key === 'sp500') return 'The S&P 500';
  return asset.name; // 'QQQ', 'Bitcoin'
}
function _marketAssetSubjectLower(asset = _currentAsset()) {
  if (asset.kind === 'yield') return 'the 10-year Treasury yield';
  if (asset.key === 'sp500') return 'the S&P 500';
  return asset.name; // 'QQQ', 'Bitcoin'
}

// Real directional move for the SELECTED asset on the active range. 1D reads the
// live daily snapshot; longer ranges read the chart's own first→last return.
// Returns { available, pct, dir } and never invents a value. The flat band is
// derived from the rounded percentage so a near-zero move never reads as a
// direction (and never as "-0.00%").
function _marketAssetMove(range = _marketChart.range) {
  const a = _currentAsset();
  const isDaily = String(range || '1D').toUpperCase() === '1D';
  let pct = null;
  if (isDaily) {
    const snap = _normalizedMarketSnapshot(a.key);
    if (snap && snap.available && Number.isFinite(snap.percentChange)) pct = snap.percentChange;
  } else {
    const stats = _marketChartStats();
    if (stats && Number.isFinite(stats.pct)) pct = stats.pct;
  }
  if (pct === null) return { available: false, pct: null, dir: 'flat' };
  const mag = Math.abs(_roundDisplay(pct, 2));
  return { available: true, pct, dir: mag < 0.05 ? 'flat' : (pct > 0 ? 'up' : 'down') };
}

// Plain-English summary of the selected asset's move on the active range.
function _marketAssetInsightSummary() {
  const a = _currentAsset();
  const move = _marketAssetMove();
  const phrase = _marketRangePhrase();
  const subject = _marketAssetSubject(a);
  if (!move.available) {
    return `There isn’t enough confirmed ${a.name} data to describe its move ${phrase} yet.`;
  }
  const flavor = _marketAssetFlavor(a);
  const isDaily = String(_marketChart.range || '1D').toUpperCase() === '1D';
  const span = isDaily ? 'session' : 'stretch';
  const during = isDaily ? 'during the session' : 'across the period';
  if (move.dir === 'flat') {
    return {
      broad: `${subject} was little changed ${phrase}, which means the broad index is not giving a strong directional signal on its own.`,
      tech: `${subject} was little changed ${phrase}, so large technology shares are not clearly leading or dragging the tape right now.`,
      crypto: `${subject} was little changed ${phrase}, trading in a narrow range rather than breaking away from recent levels.`,
      yield: `${subject} was little changed ${phrase}, suggesting rate expectations were steady in the latest available data.`
    }[flavor];
  }
  const up = move.dir === 'up';
  const dirWord = up ? 'higher' : 'lower';
  const tail = {
    broad: `${up ? 'showing buyers were willing to pay more for a broad basket of large U.S. companies' : 'showing broad U.S. stocks weakened rather than only one company pulling the index down'}.`,
    tech: `${up ? 'showing large technology shares added support to the Nasdaq-100' : 'showing large technology shares were a visible source of pressure in the Nasdaq-100'}.`,
    crypto: up ? `which can happen when appetite for higher-volatility assets improves ${during}.` : `alongside weaker risk assets, suggesting investors were reducing exposure to higher-volatility assets rather than reacting only to a crypto-specific event.`,
    yield: `${up ? 'which can tighten financial conditions because higher yields raise the hurdle for future earnings' : 'which can ease pressure on valuations when investors accept lower bond yields'}.`
  }[flavor];
  return `${subject} moved ${dirWord} ${phrase}, ${tail}`;
}

// Forward-looking "What to watch" for the selected asset only.
function _marketAssetInsightWatch() {
  const a = _currentAsset();
  const move = _marketAssetMove();
  const horizon = _marketRangeHorizon();
  const flavor = _marketAssetFlavor(a);
  const subjLower = _marketAssetSubjectLower(a);
  if (flavor === 'yield') {
    // Yields are driven by rate expectations, so the watch points at the signals
    // that move them rather than at price-style buyers/sellers.
    return 'Watch whether upcoming inflation, labor-market, or Federal Reserve signals push the 10-year yield outside its recent range.';
  }
  if (!move.available || move.dir === 'flat') {
    if (flavor === 'crypto') return `Watch whether ${a.name} breaks above or below its recent range ${horizon}; a breakout would carry more information than another quiet session.`;
    return `Watch whether ${subjLower} closes outside its recent range ${horizon}; that would show a clearer directional signal.`;
  }
  const up = move.dir === 'up';
  return {
    broad: up
      ? `Watch whether gains broaden beyond a small set of large companies ${horizon}. Broader participation would make the move more durable as a market read.`
      : `Watch whether declines remain broad across sectors ${horizon}. Narrower weakness would point to a more specific issue than a broad market pullback.`,
    tech: up
      ? `Watch whether technology keeps leading while the broader market also participates ${horizon}. A tech-only move is a narrower signal.`
      : `Watch whether technology shares keep falling faster than the broad market ${horizon}. Continued underperformance would support a growth-stock pressure read.`,
    crypto: up
      ? `Watch whether ${a.name} keeps moving with technology shares ${horizon}. Continued correlation would support a broader risk-appetite interpretation.`
      : `Watch whether ${a.name} begins moving independently from technology shares ${horizon}. Continued correlation would support a broader risk-off interpretation.`
  }[flavor];
}

// Learning concept for the Learn-next card, grounded only in the selected
// asset's flavor and its real move. Kept relatively coarse so switching ranges
// reuses the same lesson instead of spawning near-duplicates; the displayed
// TITLE (below) carries the range-specific framing.
function _marketAssetInsightLearn() {
  const a = _currentAsset();
  const move = _marketAssetMove();
  const flavor = _marketAssetFlavor(a);
  const isDaily = String(_marketChart.range || '1D').toUpperCase() === '1D';
  const mag = move.available ? Math.abs(move.pct) : 0;
  if (flavor === 'crypto') {
    if (mag >= 5) return { name: 'Bitcoin volatility' };
    if (move.dir === 'down') return { name: 'Bitcoin’s trading range' };
    if (!isDaily) return { name: 'Bitcoin over longer periods' };
    return { name: 'What drives Bitcoin’s price' };
  }
  if (flavor === 'yield') {
    if (move.dir === 'up') return { name: 'Why bond yields rise' };
    if (move.dir === 'down') return { name: 'Why bond yields fall' };
    return { name: 'How interest-rate expectations affect yields' };
  }
  // broad / tech index ETF
  if (mag >= 8) return { name: 'Market volatility' };
  if (!isDaily && move.dir === 'up') return { name: 'Long-term market returns' };
  if (move.dir === 'down') return { name: flavor === 'tech' ? 'Technology-stock declines' : 'Broad-market declines' };
  if (move.dir === 'up') return { name: 'What lifts the broad market' };
  return { name: 'Time horizon and market returns' };
}

// Display title for the Learn-next card: asset-specific AND range-specific, with
// "today" used only on 1D. Built directly from the real move so it can never
// claim a cross-asset story.
function _marketAssetInsightLearnTitle() {
  const a = _currentAsset();
  const move = _marketAssetMove();
  const range = String(_marketChart.range || '1D').toUpperCase();
  const subj = _marketAssetSubjectLower(a);
  const isYield = a.kind === 'yield';
  const up = move.dir === 'up';
  const directional = move.available && move.dir !== 'flat';
  const moveNoun = !directional ? 'move' : isYield ? (up ? 'rise' : 'decline') : up ? 'rally' : 'pullback';
  switch (range) {
    case '1D':
      return directional ? `Why ${subj} moved ${up ? 'higher' : 'lower'} today` : `What moves ${subj} day to day`;
    case '1W': return `Understanding ${subj}’s one-week ${moveNoun}`;
    case '1M': return `Understanding ${subj}’s one-month ${moveNoun}`;
    case '3M': return `Understanding ${subj}’s three-month ${moveNoun}`;
    case 'YTD': return `What ${subj}’s year-to-date performance reveals`;
    case '1Y': return `How to interpret ${subj} over the past year`;
    case '5Y': return `How to interpret ${subj} over the long term`;
    default: return `What moves ${subj}`;
  }
}

function _renderMarketInsightInner() {
  const snap = _marketSnapshot;
  const range = String(_marketChart.range || '1D').toUpperCase();
  const isDaily = range === '1D';
  // The insight describes the SELECTED asset only, on every range. 1D reads that
  // asset's live daily snapshot; longer ranges read its chart series. We never
  // mix in another asset here.
  const move = _marketAssetMove();
  const hasData = move.available;
  const head = (timeLine = '') => `
    <div class="market-insight-head">
      <span class="market-v3-spark" aria-hidden="true">${_marketThinIcon('spark')}</span>
      <h2>Market insight</h2>
      ${timeLine}
    </div>`;

  const loading = isDaily
    ? (snap.status === 'loading' || snap.status === 'idle')
    : (_marketChart.status === 'loading' || _marketChart.status === 'idle');
  if (!hasData && loading) {
    return `${head()}
      <div class="market-recap-loading">
        <span class="market-recap-spinner" aria-hidden="true"></span>
        <span>Pulling the latest market data…</span>
      </div>`;
  }
  if (!hasData) {
    const retry = isDaily ? 'ensureMarketSnapshot(true)' : 'ensureMarketChart(true)';
    return `${head()}
      <div class="market-recap-unavailable">
        <p>Live market data is unavailable right now, so there’s no insight to show — we won’t guess.</p>
        <button type="button" class="market-recap-retry" onclick="${retry}">Try again</button>
      </div>`;
  }

  const learn = _marketAssetInsightLearn();
  const learnArg = String(learn.name).replace(/'/g, "\\'");
  const learnTitle = _marketAssetInsightLearnTitle();
  const summary = _marketAssetInsightSummary();
  const watch = _marketAssetInsightWatch();

  return `
    ${head()}
    <p class="market-insight-summary">${_escapeMarketHtml(summary)}</p>
    <div class="market-insight-row">
      <h4 class="market-insight-label">What to watch</h4>
      <p>${_escapeMarketHtml(watch)}</p>
    </div>
    ${_renderMarketInsightLearn(learn, learnTitle, learnArg)}`;
}

// Learn-next control. Reflects the user's progress for the lesson this card has
// previously opened (LEARN NEXT → CONTINUE LEARNING → COMPLETED) using the
// shared MicroProgress store, and resumes that same unit instead of building a
// duplicate. Falls back to building a fresh lesson when none has been opened.
function _renderMarketInsightLearn(learn, learnTitle, learnArg) {
  const link = _marketLearnLinkFor(learn.name);
  const summary = link ? _marketLearnSummary(link.unitId) : null;
  let eyebrow = 'Learn next';
  let metaLine = _marketLessonMeta();
  let onclick = `buildMarketRecapLesson('${learnArg}')`;
  let stateClass = '';
  if (summary && summary.status === 'completed') {
    eyebrow = 'Completed';
    metaLine = 'Review lesson';
    stateClass = ' is-complete';
    onclick = `resumeMarketLearn('${learnArg}')`;
  } else if (summary && summary.started) {
    eyebrow = 'Continue learning';
    const idx = Math.min((Number(summary.currentLessonIndex) || 0) + 1, summary.total || 0);
    metaLine = summary.total ? `Lesson ${idx} of ${summary.total}` : 'Resume';
    stateClass = ' is-progress';
    onclick = `resumeMarketLearn('${learnArg}')`;
  }
  const done = stateClass === ' is-complete';
  return `
    <button type="button" class="market-insight-learn${stateClass}" onclick="${onclick}" aria-label="${done ? 'Review lesson' : 'Start lesson'}: ${_escapeMarketHtml(learnTitle)}">
      <span class="market-insight-learn-copy">
        <span class="market-insight-label">${_escapeMarketHtml(eyebrow)}</span>
        <span class="market-insight-learn-title">${_escapeMarketHtml(learnTitle)}</span>
        <span class="market-insight-learn-meta">${_escapeMarketHtml(metaLine)}</span>
      </span>
      <span class="market-insight-learn-arrow" aria-hidden="true">${done ? _marketThinIcon('check') : _marketThinIcon('chevron')}</span>
    </button>`;
}

function _paintMarketInsight() {
  const el = document.getElementById('marketInsightCard');
  if (el) el.innerHTML = _renderMarketInsightInner();
}

// ── Learn-next ⇄ lesson-state link ──────────────────────────────────
// Remembers which generated unit a given Learn-next concept opened, so the card
// can reflect real progress (and resume rather than duplicate). Keyed by the
// normalized concept string. Stored in localStorage so it survives refreshes.
const MARKET_LEARN_KEY = 'finlingo_market_learn_v1';
let _pendingMarketLearn = null;   // { key, title, at } while a build is in flight
function _marketLearnKey(concept) { return String(concept || '').trim().toLowerCase(); }
function _marketLearnStore() {
  try { return JSON.parse(localStorage.getItem(MARKET_LEARN_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _marketLearnSave(store) {
  try { localStorage.setItem(MARKET_LEARN_KEY, JSON.stringify(store)); } catch {}
}
function _marketLearnLinkFor(concept) {
  const link = _marketLearnStore()[_marketLearnKey(concept)];
  return link && link.unitId ? link : null;
}
// Returns a MicroProgress summary for a linked unit, or null if the unit is
// gone (also prunes the stale mapping) or progress isn't available yet.
function _marketLearnSummary(unitId) {
  try {
    const unit = window.MicroData && typeof window.MicroData.getMicroUnit === 'function'
      ? window.MicroData.getMicroUnit(unitId) : null;
    if (!unit) { _marketLearnPrune(unitId); return null; }
    if (window.MicroProgress && typeof window.MicroProgress.summary === 'function') {
      return window.MicroProgress.summary(unitId, unit);
    }
  } catch {}
  return null;
}
function _marketLearnPrune(unitId) {
  const store = _marketLearnStore();
  let changed = false;
  Object.keys(store).forEach(k => { if (store[k] && store[k].unitId === unitId) { delete store[k]; changed = true; } });
  if (changed) _marketLearnSave(store);
}

// Resume the lesson linked to a concept; fall back to building a fresh one.
function resumeMarketLearn(concept) {
  const link = _marketLearnLinkFor(concept);
  if (link && link.unitId && typeof window.openMicroUnit === 'function') {
    const unit = window.MicroData && window.MicroData.getMicroUnit ? window.MicroData.getMicroUnit(link.unitId) : null;
    if (unit) {
      window.openMicroUnit(link.unitId);
      return;
    }
  }
  buildMarketRecapLesson(concept);
}

// Build a lesson on the recommended concept using the existing market build flow.
function buildMarketRecapLesson(concept) {
  const c = String(concept || '').trim() || 'Market volatility';
  // Remember the concept so the unit that gets opened next can be linked back to
  // this Learn-next card (for progress display + no-duplicate resume).
  _pendingMarketLearn = { key: _marketLearnKey(c), title: c, at: Date.now() };
  _startMarketChatFlow({
    asset: _currentAsset(),
    action: 'build',
    visibleMessage: `Build a lesson on ${c}.`,
    apiPrompt: `Build a beginner-friendly lesson explaining ${c} and connect it to today’s market in plain English. Keep it educational and not financial advice. Use the supplied hidden market context without exposing it or mentioning internal instructions.`,
    context: _marketSelectedContext(),
    title: `Lesson: ${c}`
  });
}

// When any micro-unit is opened shortly after a Learn-next build, link it to the
// pending concept so the card reflects that unit's progress afterwards.
try {
  window.addEventListener('finlingo:micro-unit-opened', function (event) {
    const unitId = event && event.detail && event.detail.unitId;
    if (!unitId || !_pendingMarketLearn) return;
    // Only accept within a realistic build window (build → open can take a while).
    if (Date.now() - _pendingMarketLearn.at > 5 * 60 * 1000) { _pendingMarketLearn = null; return; }
    const store = _marketLearnStore();
    store[_pendingMarketLearn.key] = { unitId, title: _pendingMarketLearn.title, at: Date.now() };
    _marketLearnSave(store);
    _pendingMarketLearn = null;
  });
  // Keep the Learn-next card fresh when returning to Market after lesson work.
  window.addEventListener('finlingo:micro-progress-updated', function () {
    if (document.getElementById('marketScreen')?.classList.contains('active')) _paintMarketInsight();
  });
} catch {}

function _paintMarketChart() {
  const hero = document.getElementById('marketTodayHero');
  if (hero) hero.innerHTML = _renderMarketTodayHeroInner();
}

// Redraw the chart when its container actually receives (or changes) its final
// width — the Market screen opening, the menu closing, the browser/phone-frame
// resizing. We observe #marketTodayHero (a stable node whose innerHTML we swap,
// so the observer survives repaints) and skip while a width is 0/hidden or the
// user is actively scrubbing the chart.
let _marketChartResizeObserver = null;
let _marketChartLastWidth = 0;
function _observeMarketChartResize() {
  if (typeof ResizeObserver === 'undefined') return;
  const hero = document.getElementById('marketTodayHero');
  if (!hero) return;
  if (_marketChartResizeObserver) _marketChartResizeObserver.disconnect();
  _marketChartLastWidth = 0;
  _marketChartResizeObserver = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect?.width || 0;
    if (width <= 0) return;                                // hidden / zero width: wait
    if (Math.abs(width - _marketChartLastWidth) < 1) return;
    const firstMeasure = _marketChartLastWidth === 0;
    _marketChartLastWidth = width;
    if (_marketScrubPointerId != null) return;             // don't disturb an active scrub
    if (firstMeasure || _marketChart.status === 'ready') _paintMarketChart();
  });
  _marketChartResizeObserver.observe(hero);
}

function setMarketChartRange(range) {
  if (!MARKET_CHART_RANGES.includes(range) || range === _marketChart.range) return;
  _marketChart.range = range;
  _marketChart.status = 'loading';
  _marketChart.points = [];
  _marketChart.marketOpen = null;
  _marketChart.previousClose = null;
  _marketChart.interval = '';
  _marketChart.pointCount = 0;
  _marketChartView = null;
  _paintMarketChart();
  _paintMarketInsight();   // immediately reflect the new range (loading + range copy)
  ensureMarketChart(true);
}

async function ensureMarketChart(force = false) {
  if (!force && _marketChart.status === 'ready') return;
  const token = ++_marketChart.token;
  const requestedRange = _marketChart.range;
  _marketChart.inFlight = true;
  if (_marketChart.status !== 'ready') {
    _marketChart.status = 'loading';
    _paintMarketChart();
  }
  const requestedAsset = _marketChart.asset;
  try {
    const payload = await _requestPracticeStockHistory(_currentAsset().symbol, requestedRange);
    if (token !== _marketChart.token || requestedRange !== _marketChart.range || requestedAsset !== _marketChart.asset) return;
    const points = Array.isArray(payload?.points) ? payload.points : [];
    if (points.length >= 2) {
      _marketChart.points = points;
      _marketChart.marketOpen = Number(payload?.marketOpen) > 0 ? Number(payload.marketOpen) : null;
      _marketChart.previousClose = Number(payload?.previousClose) > 0 ? Number(payload.previousClose) : null;
      _marketChart.interval = String(payload?.interval || '');
      _marketChart.pointCount = Number(payload?.pointCount) || points.length;
      _marketChart.status = 'ready';
      _marketChart.error = '';
    } else {
      _marketChart.status = 'error';
      _marketChart.error = 'No chart data';
      _marketChart.marketOpen = null;
      _marketChart.previousClose = null;
      _marketChart.interval = '';
      _marketChart.pointCount = 0;
    }
  } catch (err) {
    if (token !== _marketChart.token || requestedRange !== _marketChart.range || requestedAsset !== _marketChart.asset) return;
    _marketChart.status = 'error';
    _marketChart.error = err instanceof Error ? err.message : 'Chart unavailable';
    _marketChart.points = [];
    _marketChart.marketOpen = null;
    _marketChart.previousClose = null;
    _marketChart.interval = '';
    _marketChart.pointCount = 0;
  } finally {
    if (token === _marketChart.token) {
      _marketChart.inFlight = false;
      _paintMarketChart();
      _paintMarketInsight();        // insight reads the range series
    }
  }
}

// ── Market Ask ──────────────────────────────────────────────────────
// On-demand only. Each button maps to a tutor mode + a concise prompt.
const MARKET_COACH_ACTIONS = [
  { key: 'explain', label: "Explain Today's Market", mode: 'market_explainer', prompt: "Explain today's market in plain English for a beginner." },
  { key: 'why_move', label: 'Why Did Stocks Move?', mode: 'chat', prompt: 'Why did stocks move the way they did today? Explain in plain English for a beginner.' },
  { key: 'why_care', label: 'Why Should I Care?', mode: 'chat', prompt: 'Why should a beginner investor care about today’s market move? Keep it practical.' },
  { key: 'eli15', label: "Explain Like I'm 15", mode: 'analogy', prompt: "Explain today's market move like I'm 15, using one simple analogy." },
  { key: 'example', label: 'Give Me An Example', mode: 'chat', prompt: 'Give one concrete everyday example that illustrates today’s market move for a beginner.' },
  { key: 'quiz', label: 'Quiz Me', mode: 'quiz', prompt: 'Create a short quiz about the core concepts behind today’s market.' }
];

const _marketCoach = {
  busy: false,
  action: null,
  answer: null,
  structured: null,
  quiz: null,
  quizAnswers: {},
  error: ''
};

async function askMarketCoach(key) {
  if (_marketCoach.busy) return;
  const action = MARKET_COACH_ACTIONS.find(a => a.key === key);
  if (!action) return;
  _marketCoach.busy = true;
  _marketCoach.action = key;
  _marketCoach.answer = null;
  _marketCoach.structured = null;
  _marketCoach.quiz = null;
  _marketCoach.quizAnswers = {};
  _marketCoach.error = '';
  if (typeof recordAskedTopic === 'function') recordAskedTopic(`Today's market: ${action.label}`);
  _paintMarketCoach();
  try {
    const context = typeof _marketTutorContext === 'function'
      ? _marketTutorContext().text
      : 'The user is exploring today’s market.';
    const res = await fetch('/api/ask-finlingo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        mode: action.mode,
        context,
        messages: [{ role: 'user', content: action.prompt }]
      })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Ask request failed (${res.status})`);
    if (action.mode === 'quiz') {
      _marketCoach.quiz = (payload.result && Array.isArray(payload.result.questions)) ? payload.result : null;
      if (!_marketCoach.quiz) throw new Error('Ask could not build a quiz right now.');
    } else if (payload.result) {
      _marketCoach.structured = payload.result;
    } else {
      _marketCoach.answer = payload.answer || 'No answer was returned.';
    }
  } catch (err) {
    _marketCoach.error = err instanceof Error ? err.message : 'Ask is temporarily unavailable.';
  } finally {
    _marketCoach.busy = false;
    _paintMarketCoach();
  }
}

function selectMarketCoachQuizChoice(qIndex, cIndex) {
  if (!_marketCoach.quiz) return;
  if (Number.isInteger(_marketCoach.quizAnswers[qIndex])) return;
  _marketCoach.quizAnswers[qIndex] = cIndex;
  const q = _marketCoach.quiz.questions?.[qIndex];
  if (q && cIndex !== Number(q.correct_index) && typeof window !== 'undefined' && window.CoachReview) {
    const conn = _getMarketConnection();
    const first = conn.links && conn.links[0];
    window.CoachReview.flag({
      topic: first ? first.label : 'This concept',
      source: 'your market quiz',
      lessonId: first ? first.lessonId : null,
      note: 'Missed a question in Market Ask.'
    });
  }
  _paintMarketCoach();
}

function _renderMarketCoachText(text) {
  const sections = (typeof _splitTutorSections === 'function') ? _splitTutorSections(text) : null;
  if (sections && sections.length) {
    return `<div class="mc-sections">${sections.map(section => `
      <div class="mc-section"><span>${_escapeMarketHtml(section.label)}</span><p>${_escapeMarketHtml(section.body)}</p></div>
    `).join('')}</div>`;
  }
  const clean = (typeof _cleanTutorMarkdown === 'function') ? _cleanTutorMarkdown(text) : text;
  return `<div class="mc-answer"><p>${_escapeMarketHtml(clean)}</p></div>`;
}

function _renderMarketCoachStructured(result) {
  const rows = [
    ['What happened', result.what_happened],
    ['Why it happened', result.why_it_happened],
    ['Why it matters', result.why_it_matters],
    ['Beginner takeaway', result.beginner_takeaway]
  ].filter(([, value]) => value);
  return `<div class="mc-sections">${rows.map(([label, value]) => `
    <div class="mc-section"><span>${_escapeMarketHtml(label)}</span><p>${_escapeMarketHtml(value)}</p></div>
  `).join('')}</div>`;
}

function _renderMarketCoachQuiz(quiz) {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  return `
    <div class="mc-quiz">
      <div class="mc-quiz-title">${_escapeMarketHtml(quiz.title || 'Quick check')}</div>
      ${questions.map((q, qi) => {
        const picked = _marketCoach.quizAnswers[qi];
        const answered = Number.isInteger(picked);
        const correct = Number(q.correct_index);
        return `
          <div class="mc-quiz-q">
            <strong>${qi + 1}. ${_escapeMarketHtml(q.question)}</strong>
            <div class="mc-quiz-choices">
              ${(q.choices || []).map((choice, ci) => {
                let cls = '';
                if (answered && ci === correct) cls = ' is-correct';
                else if (answered && ci === picked) cls = ' is-wrong';
                return `<button type="button" class="mc-quiz-choice${cls}" ${answered ? 'disabled' : ''} onclick="selectMarketCoachQuizChoice(${qi},${ci})">${String.fromCharCode(65 + ci)}. ${_escapeMarketHtml(choice)}</button>`;
              }).join('')}
            </div>
            ${answered ? `<div class="mc-quiz-fb ${picked === correct ? 'ok' : 'no'}"><b>${picked === correct ? 'Correct.' : 'Not quite.'}</b> ${_escapeMarketHtml(q.explanation)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function _renderMarketCoachRelated() {
  const conn = _getMarketConnection();
  const links = (conn.links || []).map(item => `
    <button type="button" onclick="openCourse(${item.lessonId})">${_escapeMarketHtml(item.label)}</button>
  `).join('');
  if (!links) return '';
  return `
    <div class="mc-related">
      <span class="mc-related-label">Related concepts</span>
      <div class="mc-related-links">${links}</div>
    </div>`;
}

function _renderMarketCoachResponse() {
  const c = _marketCoach;
  if (c.busy) {
    return `<div class="mc-loading"><span class="mc-spinner" aria-hidden="true"></span>Reading today’s market…</div>`;
  }
  if (c.error) {
    return `<div class="mc-error">${_escapeMarketHtml(c.error)} <button type="button" class="mc-retry" onclick="askMarketCoach('${c.action || 'explain'}')">Try again</button></div>`;
  }
  if (!c.action) {
    return `<div class="mc-placeholder">Pick a question and get a plain-English answer — concise, no jargon.</div>`;
  }
  let body = '';
  if (c.quiz) body = _renderMarketCoachQuiz(c.quiz);
  else if (c.structured) body = _renderMarketCoachStructured(c.structured);
  else if (c.answer) body = _renderMarketCoachText(c.answer);
  return `${body}${_renderMarketCoachRelated()}<div class="mc-disclaimer">Educational only. Not financial advice.</div>`;
}

function _renderMarketCoachInner() {
  const buttons = MARKET_COACH_ACTIONS.map(a => `
    <button type="button" data-coach-action="${a.key}" class="market-coach-btn${_marketCoach.action === a.key ? ' is-active' : ''}" ${_marketCoach.busy ? 'disabled' : ''} onclick="askMarketCoach('${a.key}')">${_escapeMarketHtml(a.label)}</button>
  `).join('');
  return `
    <div class="market-coach-head">
      <span class="market-coach-badge">Ask</span>
      <h2>Understand today’s market</h2>
      <p class="market-coach-lead">Today’s market is ready to explore.</p>
      <p class="market-coach-sub">What would you like to understand?</p>
    </div>
    <div class="market-coach-actions">${buttons}</div>
    <div class="market-coach-response" id="marketCoachResponse" aria-live="polite">${_renderMarketCoachResponse()}</div>
    <div class="market-coach-foot">
    </div>`;
}

function _renderMarketCoachCard() {
  return `<section class="market-coach-card" id="marketCoachCard">${_renderMarketCoachInner()}</section>`;
}

function _paintMarketCoach() {
  const el = document.getElementById('marketCoachCard');
  if (el) el.innerHTML = _renderMarketCoachInner();
}

// ══════════════════════════════════════════════════════════════
// LIVE MARKET SNAPSHOT (Market tab)
// Real quote + sparkline cards for SPY / QQQ / BTC, sourced from the
// existing Finnhub-backed market API. No second integration: quotes use
// the existing /api/quotes contract first, then fall back to the deployed
// Supabase market-quotes Edge Function; sparklines use /api/stock-history.
// ══════════════════════════════════════════════════════════════

const MARKET_SNAPSHOT_SYMBOLS = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'QQQ' },
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: '^TNX', name: '10-Year Treasury', kind: 'yield' }
];
const MARKET_SNAPSHOT_REFRESH_MS = 60000;

// The union of Global-Markets symbols and Curated-Watchlist symbols. One fetch
// populates both sections from the same live quotes (no extra request, no
// fabricated values). Global cards still iterate MARKET_SNAPSHOT_SYMBOLS only.
function _allSnapshotSymbols() {
  const seen = new Set();
  const out = [];
  MARKET_SNAPSHOT_SYMBOLS.forEach(s => { if (!seen.has(s.symbol)) { seen.add(s.symbol); out.push(s); } });
  (typeof MARKET_WATCHLIST !== 'undefined' ? MARKET_WATCHLIST : []).forEach(w => {
    if (!seen.has(w.symbol)) { seen.add(w.symbol); out.push({ symbol: w.symbol, name: w.name }); }
  });
  return out;
}

const _marketSnapshot = {
  status: 'idle',   // idle | loading | ready | error
  error: '',
  quotes: {},       // symbol -> { price, change, changePct, previousClose }
  charts: {},       // symbol -> { status: loading|ready|error, points, error }
  fetchedAt: 0,
  inFlight: false
};

function _snapshotStatusLabel(session) {
  switch (session) {
    case 'crypto': return 'Open 24/7';
    case 'open': return 'Market Open';
    case 'premarket': return 'Pre-Market';
    case 'afterhours': return 'After Hours';
    default: return 'Market Closed';
  }
}

function _normalizeSnapshotQuotes(payload) {
  // Accept both the flat { SYM: {...} } proxy shape and the Edge Function's
  // { provider, fetchedAt, quotes: { SYM: {...} } } shape.
  const src = payload && typeof payload.quotes === 'object' && payload.quotes
    ? payload.quotes
    : payload;
  const out = {};
  if (!src || typeof src !== 'object') return out;
  _allSnapshotSymbols().forEach(({ symbol }) => {
    const q = src[symbol];
    const price = Number(q?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const prev = Number(q?.previousClose);
    let pct = Number(q?.dailyChangePct);
    if (!Number.isFinite(pct)) {
      pct = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
    }
    const change = Number.isFinite(prev) && prev > 0
      ? price - prev
      : (price * pct) / 100;
    out[symbol] = {
      symbol,
      price,
      previousClose: Number.isFinite(prev) && prev > 0 ? prev : null,
      change,
      changePct: Number.isFinite(pct) ? pct : 0
    };
  });
  return out;
}

async function _fetchSnapshotQuotesViaSupabase(symbols) {
  if (typeof SB_URL !== 'string' || !SB_URL) {
    throw new Error('Market endpoint unavailable');
  }
  const url = `${SB_URL}/functions/v1/market-quotes?symbols=${encodeURIComponent(symbols.join(','))}`;
  const headers = {};
  if (typeof SB_KEY === 'string' && SB_KEY) {
    headers.apikey = SB_KEY;
    headers.Authorization = `Bearer ${SB_KEY}`;
  }
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Live quotes unavailable (${res.status})`);
  const payload = await res.json();
  if (!payload || typeof payload !== 'object') throw new Error('Quote payload missing');
  return payload;
}

async function _fetchSnapshotQuotes() {
  const symbols = _allSnapshotSymbols().map(s => s.symbol);
  // 1. Existing local/proxy API (e.g. python3 server.py) — flat payload.
  try {
    const payload = await _fetchMarketJson(
      `/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
      { notFoundMessage: 'quotes route missing', invalidPayloadMessage: 'Quote payload missing' }
    );
    const norm = _normalizeSnapshotQuotes(payload);
    if (Object.keys(norm).length) return norm;
  } catch (_) {
    /* fall through to the deployed Edge Function */
  }
  // 2. Deployed Supabase Edge Function (existing Finnhub-backed market-quotes).
  const payload = await _fetchSnapshotQuotesViaSupabase(symbols);
  const norm = _normalizeSnapshotQuotes(payload);
  if (!Object.keys(norm).length) throw new Error('No live quotes available');
  return norm;
}

async function _fetchSnapshotCharts() {
  await Promise.all(MARKET_SNAPSHOT_SYMBOLS.map(async ({ symbol }) => {
    const existing = _marketSnapshot.charts[symbol];
    if (existing && existing.status === 'ready') return;
    _marketSnapshot.charts[symbol] = { status: 'loading', points: [], error: '' };
    try {
      const payload = await _requestPracticeStockHistory(symbol, '1D');
      const points = Array.isArray(payload?.points) ? payload.points : [];
      _marketSnapshot.charts[symbol] = points.length >= 2
        ? { status: 'ready', points, error: '' }
        : { status: 'error', points: [], error: 'No chart data' };
    } catch (err) {
      _marketSnapshot.charts[symbol] = {
        status: 'error',
        points: [],
        error: err instanceof Error ? err.message : 'No chart data'
      };
    }
  }));
  _paintMarketSnapshot();
}

async function ensureMarketSnapshot(force = false) {
  const fresh = _marketSnapshot.status === 'ready'
    && (Date.now() - _marketSnapshot.fetchedAt) < MARKET_SNAPSHOT_REFRESH_MS;
  if (_marketSnapshot.inFlight || (fresh && !force)) return;

  _marketSnapshot.inFlight = true;
  if (_marketSnapshot.status !== 'ready') _marketSnapshot.status = 'loading';
  _paintMarketSnapshot();

  try {
    _marketSnapshot.quotes = await _fetchSnapshotQuotes();
    _marketSnapshot.status = 'ready';
    _marketSnapshot.error = '';
    _marketSnapshot.fetchedAt = Date.now();
    _logMarketSnapshots();
  } catch (err) {
    if (_marketSnapshot.status !== 'ready') {
      _marketSnapshot.status = 'error';
      _marketSnapshot.error = err instanceof Error ? err.message : 'Unable to load market data';
    }
  } finally {
    _marketSnapshot.inFlight = false;
    if (_marketSnapshot.status === 'ready' && document.getElementById('marketScreen')?.classList.contains('active')) {
      renderMarket();
    } else {
      _paintMarketSnapshot();
    }
  }

  // The redesigned Market page uses simple numbers only; no sparkline fetches.
}

function _paintMarketSnapshot() {
  const cardsEl = document.getElementById('marketSnapshotCards');
  if (cardsEl) cardsEl.innerHTML = _renderMarketSnapshotCardsInner();
  const statusEl = document.getElementById('marketStatusLabel');
  if (statusEl) statusEl.innerHTML = _renderMarketStatusLabelInner();
  _paintMarketWatchlist();
  _paintMarketSentiment();
  _paintMarketInsight();
}

// ── Curated Watchlist ──────────────────────────────────────────────
// Clean list of instruments driven ENTIRELY by the live snapshot quotes.
// A row is rendered only when a real, positive price exists for its symbol;
// otherwise it is dropped, so the list shrinks rather than showing fake data.
// Rows are selectable and switch the chart via the existing asset selector.
function _watchlistTicker(symbol) {
  return String(symbol || '').replace('-USD', '').slice(0, 4).toUpperCase();
}
function _renderMarketWatchlistInner() {
  const quotes = _marketSnapshot.quotes || {};
  const rows = MARKET_WATCHLIST.map(w => {
    const q = quotes[w.symbol];
    const price = Number(q && q.price);
    if (!Number.isFinite(price) || price <= 0) return null; // no real quote → skip
    const pct = Number(q.changePct);
    const cls = _marketChangeClass(pct);
    const pctText = `${pct >= 0 ? '+' : ''}${(Number.isFinite(pct) ? pct : 0).toFixed(2)}%`;
    const sel = w.assetKey === _marketChart.asset;
    const label = `${w.name}, ${_formatAssetValue(price)}, ${pctText}. View chart.`;
    return `
      <button type="button" class="market-wl-row${sel ? ' is-selected' : ''}" aria-pressed="${sel ? 'true' : 'false'}"
              aria-label="${_escapeMarketHtml(label)}" onclick="selectMarketAsset('${w.assetKey}')">
        <span class="market-wl-badge" aria-hidden="true">${_escapeMarketHtml(_watchlistTicker(w.symbol))}</span>
        <span class="market-wl-main">
          <span class="market-wl-name">${_escapeMarketHtml(w.name)}</span>
          <span class="market-wl-sector">${_escapeMarketHtml(w.sector)}</span>
        </span>
        <span class="market-wl-nums">
          <span class="market-wl-price">${_escapeMarketHtml(_formatAssetValue(price))}</span>
          <span class="market-wl-delta ${cls}">${_escapeMarketHtml(pctText)}</span>
        </span>
      </button>`;
  }).filter(Boolean);
  if (!rows.length) {
    const msg = _marketSnapshot.status === 'error'
      ? 'Live quotes are unavailable right now.'
      : 'Loading live quotes…';
    return `<div class="market-wl-empty">${msg}</div>`;
  }
  return rows.join('');
}
function _paintMarketWatchlist() {
  const el = document.getElementById('marketWatchlist');
  if (el) el.innerHTML = _renderMarketWatchlistInner();
}

// ── Market Sentiment (interpretive) ────────────────────────────────
// An EDUCATIONAL read derived from today's real moves — broad equities,
// the tech tilt, rate direction and crypto risk appetite. It is a
// heuristic interpretation, NOT a sourced index, so it is labelled as a
// "market read" and never shows a fake precise number. When live data is
// missing the panel says so instead of inventing a reading.
const _SENTIMENT_BANDS = [
  { key: 'defensive',    label: 'Defensive',    max: 30 },
  { key: 'cautious',     label: 'Cautious',     max: 45 },
  { key: 'neutral',      label: 'Neutral',      max: 55 },
  { key: 'constructive', label: 'Constructive', max: 70 },
  { key: 'risk-on',      label: 'Risk-on',      max: 101 }
];
function _computeMarketSentiment() {
  const q = _marketSnapshot.quotes || {};
  const spy = q.SPY, qqq = q.QQQ, btc = q.BTC, tnx = q['^TNX'];
  const okPct = v => v && Number.isFinite(Number(v.changePct));
  if (_marketSnapshot.status !== 'ready' || !okPct(spy)) return { available: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const spyPct = Number(spy.changePct);
  const qqqPct = okPct(qqq) ? Number(qqq.changePct) : null;
  const btcPct = okPct(btc) ? Number(btc.changePct) : null;
  const tnxChg = tnx && Number.isFinite(Number(tnx.change)) ? Number(tnx.change) : null; // yield-point move
  let score = 50;
  score += clamp(spyPct, -3, 3) * 7;    // broad market direction (dominant)
  if (qqqPct != null) score += clamp(qqqPct, -3, 3) * 4;    // growth / tech tilt
  if (btcPct != null) score += clamp(btcPct, -6, 6) * 1.4;  // risk appetite
  if (tnxChg != null) score += clamp(-tnxChg, -0.2, 0.2) * 35; // rising yields = headwind
  score = clamp(Math.round(score), 3, 97);
  const band = _SENTIMENT_BANDS.find(b => score < b.max) || _SENTIMENT_BANDS[2];
  const fmtPct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
  const tone = v => v == null ? 'flat' : (v > 0.05 ? 'up' : (v < -0.05 ? 'down' : 'flat'));
  const factors = [
    { label: 'S&P 500', value: fmtPct(spyPct), tone: tone(spyPct) }
  ];
  if (qqqPct != null) factors.push({ label: 'Nasdaq-100', value: fmtPct(qqqPct), tone: tone(qqqPct) });
  if (btcPct != null) factors.push({ label: 'Bitcoin', value: fmtPct(btcPct), tone: tone(btcPct) });
  if (tnx && Number.isFinite(Number(tnx.price))) {
    factors.push({
      label: '10-year Treasury',
      value: `${Number(tnx.price).toFixed(2)}%`,
      tone: tnxChg == null ? 'flat' : (tnxChg > 0.01 ? 'down' : (tnxChg < -0.01 ? 'up' : 'flat'))
    });
  }
  // Driver = the single strongest real signal.
  const leadUp = spyPct >= 0;
  const techLag = qqqPct != null && qqqPct < spyPct - 0.3;
  const techLead = qqqPct != null && qqqPct > spyPct + 0.3;
  const btcSame = btcPct != null && tone(btcPct) === tone(spyPct) && tone(spyPct) !== 'flat';
  const driver = leadUp
    ? `Broad equities are higher${techLead ? ', with technology adding to the move' : (techLag ? ', though technology is lagging' : '')}${btcSame ? ', and Bitcoin is moving in the same direction' : ''}.`
    : `Broad equities are lower${techLag ? ', with technology under extra pressure' : ''}${btcSame ? ', and Bitcoin is declining alongside stocks' : ''}.`;
  const meaning = {
    defensive:    'Higher-volatility assets are weakening together, which points to broad caution rather than one isolated headline. That is a useful moment to compare how stocks, crypto, and rates relate.',
    cautious:     'Risk appetite is softer, but not extreme. If technology shares and Bitcoin keep moving together, it supports the idea that investors are trimming higher-volatility exposure.',
    neutral:      'Signals are mixed and roughly balanced. Quiet, range-bound days like this are normal — they show that not every session carries a strong directional message.',
    constructive: 'Risk appetite is firm without looking stretched. Broad participation matters because a move led by several areas is different from a rally concentrated in one corner.',
    'risk-on':    'Growth and higher-volatility assets are rising together. That shows stronger risk appetite, while still leaving room to check whether the move is broad or concentrated.'
  }[band.key];
  return { available: true, score, band, driver, meaning, factors: factors.slice(0, 4) };
}
function _renderMarketSentimentInner() {
  const s = _computeMarketSentiment();
  if (!s.available) {
    const msg = _marketSnapshot.status === 'error'
      ? 'A market read is unavailable right now — live data could not load.'
      : (_marketSnapshot.status === 'ready'
        ? 'A market read is unavailable right now.'
        : 'Reading today’s market…');
    return `
      <div class="mono-label mono-label--block market-global-label">Market Sentiment</div>
      <div class="market-sentiment-card">
        <p class="market-sentiment-unavail">${msg}</p>
      </div>`;
  }
  const factorRows = s.factors.map(f => `
    <div class="market-sentiment-factor">
      <span class="market-sentiment-factor-label">${_escapeMarketHtml(f.label)}</span>
      <span class="market-sentiment-factor-value ${f.tone}">${_escapeMarketHtml(f.value)}</span>
    </div>`).join('');
  return `
    <div class="mono-label mono-label--block market-global-label">Market Sentiment</div>
    <div class="market-sentiment-card">
      <div class="market-sentiment-head">
        <div>
          <span class="market-sentiment-state market-sentiment-state-${s.band.key}">${_escapeMarketHtml(s.band.label)}</span>
          <span class="market-sentiment-tag">Market read · educational signal</span>
        </div>
      </div>
      <div class="market-sentiment-gauge" role="img" aria-label="Sentiment read: ${_escapeMarketHtml(s.band.label)}, ${s.score} of 100 on a defensive-to-risk-on scale">
        <span class="market-sentiment-gauge-fill" style="width:${s.score}%"></span>
        <span class="market-sentiment-gauge-marker" style="left:${s.score}%"></span>
      </div>
      <div class="market-sentiment-scale" aria-hidden="true">
        <span>Defensive</span><span>Neutral</span><span>Risk-on</span>
      </div>
      <p class="market-sentiment-driver">${_escapeMarketHtml(s.driver)}</p>
      <div class="market-sentiment-means">
        <span class="market-sentiment-means-label">What this means</span>
        <p>${_escapeMarketHtml(s.meaning)}</p>
      </div>
      <div class="market-sentiment-factors">${factorRows}</div>
    </div>`;
}
function _paintMarketSentiment() {
  const el = document.getElementById('marketSentiment');
  if (el) el.innerHTML = _renderMarketSentimentInner();
}

function _renderMarketStatusLabelInner() {
  const us = _getAssetMarketStatus(_findPracticeAsset('SPY') || { symbol: 'SPY' });
  const label = _snapshotStatusLabel(us.session);
  return `
    <span class="market-status-badge market-status-badge-${us.tone}">${_escapeMarketHtml(label)}</span>
    <span class="market-status-note">U.S. stocks · Eastern Time · crypto trades 24/7</span>`;
}

function _buildSnapshotSparkline(points, positive) {
  const vals = (points || []).map(p => Number(p.value)).filter(Number.isFinite);
  if (vals.length < 2) return '';
  const width = 96, height = 34, pad = 3;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = (max - min) || 1;
  const stepX = (width - pad * 2) / (vals.length - 1);
  const line = vals
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const tone = positive ? 'up' : 'down';
  return `<svg class="snap-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline class="snap-spark-line ${tone}" points="${line}"/></svg>`;
}

function _renderSnapshotSkeleton(meta) {
  return `
    <div class="snap-card snap-card-skeleton">
      <div class="snap-card-head">
        <div class="snap-id">
          <div class="snap-sym">${_escapeMarketHtml(meta.symbol)}</div>
          <div class="snap-name">${_escapeMarketHtml(meta.name)}</div>
        </div>
        <span class="snap-skeleton-pill"></span>
      </div>
      <div class="snap-card-body">
        <div class="snap-price-col">
          <div class="snap-skeleton-line snap-skeleton-line-lg"></div>
          <div class="snap-skeleton-line"></div>
        </div>
        <div class="snap-spark-wrap"><div class="snap-spark-loading"></div></div>
      </div>
    </div>`;
}

function _renderSnapshotCard(meta) {
  const { symbol, name } = meta;
  const quote = _marketSnapshot.quotes[symbol];
  const asset = _findPracticeAsset(symbol) || { symbol };
  const status = _getAssetMarketStatus(asset);
  const statusBadge = `<span class="market-status-badge market-status-badge-${status.tone} compact">${_escapeMarketHtml(_snapshotStatusLabel(status.session))}</span>`;

  if (!quote) {
    return `
      <div class="snap-card">
        <div class="snap-card-head">
          <div class="snap-id">
            <div class="snap-sym">${_escapeMarketHtml(symbol)}</div>
            <div class="snap-name">${_escapeMarketHtml(name)}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="snap-unavailable">Price unavailable right now</div>
      </div>`;
  }

  const positive = quote.changePct >= 0;
  const tone = quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat';
  const isBtc = symbol === 'BTC';
  const isYield = meta.kind === 'yield';
  const decimals = isBtc ? 0 : 2;
  const displayPrice = Number(quote.price);
  const displayChange = Number(quote.change);
  const priceText = isYield ? `${displayPrice.toFixed(2)}%` : _formatUsd(displayPrice, decimals);
  const changeText = isYield
    ? `${displayChange >= 0 ? '+' : '-'}${Math.abs(displayChange).toFixed(2)} pts`
    : `${quote.change >= 0 ? '+' : '-'}${_formatUsd(Math.abs(quote.change), decimals)}`;
  const pctText = `${quote.changePct >= 0 ? '+' : '-'}${Math.abs(quote.changePct).toFixed(2)}%`;

  const chart = _marketSnapshot.charts[symbol];
  let sparkHtml;
  if (!chart || chart.status === 'loading') {
    sparkHtml = `<div class="snap-spark-loading"></div>`;
  } else if (chart.status === 'ready') {
    sparkHtml = _buildSnapshotSparkline(chart.points, positive) || `<div class="snap-spark-empty"></div>`;
  } else {
    sparkHtml = `<div class="snap-spark-empty"></div>`;
  }

  return `
    <div class="snap-card market-mini-card">
      <div class="snap-card-head">
        <div class="snap-id">
          <div class="snap-sym">${_escapeMarketHtml(symbol === '^TNX' ? '10Y' : symbol)}</div>
          <div class="snap-name">${_escapeMarketHtml(name)}</div>
        </div>
      </div>
      <div class="snap-card-body">
        <div class="snap-price-col">
          <div class="snap-price">${_escapeMarketHtml(priceText)}</div>
          <div class="snap-change ${tone}">${_escapeMarketHtml(changeText)} (${_escapeMarketHtml(pctText)})</div>
        </div>
      </div>
    </div>`;
}

function _renderMarketSnapshotCardsInner() {
  const snap = _marketSnapshot;
  const hasQuotes = Object.keys(snap.quotes).length > 0;

  if ((snap.status === 'idle' || snap.status === 'loading') && !hasQuotes) {
    return MARKET_SNAPSHOT_SYMBOLS.map(_renderSnapshotSkeleton).join('');
  }
  if (snap.status === 'error' && !hasQuotes) {
    return `
      <div class="snap-error">
        <div class="snap-error-title">Live market data unavailable</div>
        <div class="snap-error-sub">${_escapeMarketHtml(snap.error || 'Could not reach the market service.')}</div>
        <button type="button" class="snap-retry" onclick="ensureMarketSnapshot(true)">Try again</button>
      </div>`;
  }
  return MARKET_SNAPSHOT_SYMBOLS.map(_renderSnapshotCard).join('');
}

function _getSimpleMarketIndicators() {
  const rows = [
    {
      symbol: 'SPY',
      name: 'S&P 500 ETF',
      fallbackValue: 'Broad U.S. stocks',
      fallbackChange: 'Benchmark',
      lesson: 'Use this as a rough read on large U.S. companies, not as a verdict on every stock.'
    },
    {
      symbol: 'QQQ',
      name: 'Nasdaq 100 ETF',
      fallbackValue: 'Growth stocks',
      fallbackChange: 'Tech-heavy',
      lesson: 'This often moves more with technology and growth expectations.'
    },
    {
      symbol: 'SCHD',
      name: 'Dividend Equity ETF',
      fallbackValue: 'Income stocks',
      fallbackChange: 'Defensive',
      lesson: 'This is a simple contrast for steadier, dividend-paying companies.'
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      fallbackValue: 'Digital asset',
      fallbackChange: 'Volatile',
      lesson: 'This shows how sharply speculative assets can move without company earnings underneath.'
    }
  ];

  const portfolio = S.portfolio || {};
  return rows.map(row => {
    const asset = typeof PRACTICE_MARKET_ASSETS !== 'undefined'
      ? PRACTICE_MARKET_ASSETS.find(item => item.symbol === row.symbol)
      : null;
    const quote = portfolio.assets?.[row.symbol];
    const price = Number(quote?.price) || Number(asset?.basePrice) || 0;
    const changePct = Number(quote?.dailyChangePct);
    const tone = Number.isFinite(changePct) && changePct > 0
      ? 'up'
      : Number.isFinite(changePct) && changePct < 0
        ? 'down'
        : 'flat';
    return {
      ...row,
      value: price > 0 ? _formatUsd(price, row.symbol === 'BTC' ? 0 : 2) : row.fallbackValue,
      change: Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : row.fallbackChange,
      tone
    };
  });
}


// ══════════════════════════════════════════════════════════════
// PUBLIC ENTRY POINT
// ══════════════════════════════════════════════════════════════

/**
 * Open a market feature modal.
 * Called by Market feature cards and deep links.
 * @param {string} featureId - matches a market feature id
 */
function openMarketFeature(featureId) {
  if (featureId === 'daily-market-prediction') {
    if (typeof openDailyPredictionModal === 'function') openDailyPredictionModal();
    return;
  }
  if (featureId === 'portfolio-simulator') {
    _openPortfolioSimulator();
    return;
  }
  if (featureId === 'guess-the-chart') {
    openMarketChartGuess();
    return;
  }
  if (featureId === 'market-mastery') {
    if (typeof openFinanceFluencySession === 'function') {
      openFinanceFluencySession({ forceNew: true, scope: 'market' });
    }
    return;
  }
  if (featureId === 'finance-duels') {
    _showFinanceDuelsPlaceholder();
    return;
  }

  const bank = SCENARIO_BANK[featureId];
  if (!bank) return;

  // Pick 3 random scenarios each session
  _mBank      = [...bank].sort(() => Math.random() - 0.5).slice(0, 3);
  _mIdx       = 0;
  _mSelected  = null;
  _mLocked    = false;
  _mFeatureId = featureId;
  _mXpTotal   = 0;
  _mStartXp   = S.xp || 0;

  _openMarketModal();
  _renderScenario();
}


// ══════════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════════

function _openMarketModal() {
  document.getElementById('marketModal').classList.add('open');
}

function _closeMarketModal() {
  document.getElementById('marketModal').classList.remove('open');
  document.getElementById('marketModalBox')?.classList.remove('market-modal-box-stock-detail');
  _stopPracticePortfolioRefresh();
  if (_marketInvestOpenTimer) {
    clearTimeout(_marketInvestOpenTimer);
    _marketInvestOpenTimer = 0;
  }
  _portfolioChartFetchToken += 1;
  _portfolioDetailSymbol = null;
  _portfolioDetailRange = '1D';
  _portfolioChartPending = false;
  _portfolioChartError = '';
  _portfolioChartDebugInfo = null;
  _mFeatureId = '';
  // Refresh market cards in case XP unlocked a new rank/feature
  if (typeof renderMarket === 'function') renderMarket();
}


// ══════════════════════════════════════════════════════════════
// SCENARIO RENDERER
// ══════════════════════════════════════════════════════════════

const _FEATURE_TITLES = {
  'investment-scenarios': 'Investment Scenarios',
  'market-events':        'Market Events',
  'case-studies':         'Case Studies',
};

function _renderScenario() {
  const box      = document.getElementById('marketModalBox');
  box?.classList.remove('market-modal-box-stock-detail');
  const scenario = _mBank[_mIdx];
  const total    = _mBank.length;
  const xpPerQ   = MARKET_XP[_mFeatureId] || 20;
  const xpAward  = calculateXpAward(xpPerQ);
  const title    = _FEATURE_TITLES[_mFeatureId] || 'Market Challenge';
  const progPct  = (_mIdx / total) * 100;
  const isLast   = _mIdx === total - 1;

  box.innerHTML = `
    <div class="mkt-modal-header">
      <button class="mkt-close-btn" onclick="_closeMarketModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          style="width:14px;height:14px;">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="mkt-modal-title">${title}</div>
      <div class="mkt-modal-prog">${_mIdx + 1} / ${total}</div>
    </div>
    <div class="mkt-prog-track">
      <div class="mkt-prog-fill" style="width:${progPct}%"></div>
    </div>

    <div class="mkt-scroll-body">
      <div class="mkt-situation">${scenario.situation}</div>
      <div class="mkt-question">${scenario.question}</div>

      <div class="mkt-choices" id="mktChoices">
        ${scenario.choices.map((c, i) => `
          <div class="mkt-choice" id="mktChoice_${i}" onclick="_mSelectChoice(${i})">
            <div class="mkt-choice-letter">${'ABCD'[i]}</div>
            <div class="mkt-choice-text">${c}</div>
          </div>`).join('')}
      </div>

      <div class="mkt-fb-box" id="mktFb" style="display:none;"></div>
    </div>

    <div class="mkt-action-row">
      <button class="btn btn-secondary mkt-check-btn" id="mktCheckBtn"
        disabled onclick="_mCheckAnswer()">Check</button>
      <button class="btn btn-primary mkt-next-btn" id="mktNextBtn"
        style="display:none;"
        onclick="${isLast ? '_mFinish()' : '_mNextScenario()'}">
        ${isLast ? `Finish +${xpAward.xpAwarded} XP` : `Next ${FinLingoIcons.right()}`}
      </button>
    </div>`;
}

function _mSelectChoice(idx) {
  if (_mLocked) return;
  _mSelected = idx;
  document.querySelectorAll('.mkt-choice').forEach((el, i) => {
    el.classList.toggle('mkt-choice-selected', i === idx);
  });
  const checkBtn = document.getElementById('mktCheckBtn');
  if (checkBtn) checkBtn.disabled = false;
}

function _mCheckAnswer() {
  if (_mLocked || _mSelected === null) return;
  _mLocked = true;

  const scenario  = _mBank[_mIdx];
  const correct   = scenario.correct;
  const isCorrect = _mSelected === correct;
  const xpPerQ    = MARKET_XP[_mFeatureId] || 20;
  const award     = isCorrect
    ? awardRewards({
        baseXp: xpPerQ,
        source: 'market_correct',
        meta: {
          skipQuestUpdate: true,
          questionId: `market:${_mFeatureId}:${_mIdx + 1}`,
          topicId: _mFeatureId,
          difficulty: 'hard'
        }
      })
    : { xpAwarded: 0 };

  // Highlight choices
  document.querySelectorAll('.mkt-choice').forEach((el, i) => {
    el.classList.remove('mkt-choice-selected');
    if (i === correct)                   el.classList.add('mkt-choice-correct');
    if (i === _mSelected && !isCorrect)  el.classList.add('mkt-choice-incorrect');
  });

  // Feedback
  const fb = document.getElementById('mktFb');
  if (fb) {
    fb.style.display = '';
    fb.className = 'mkt-fb-box ' + (isCorrect ? 'mkt-fb-correct' : 'mkt-fb-incorrect');
    fb.innerHTML = `
      <div class="mkt-fb-head">
        ${isCorrect
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
               style="width:14px;height:14px;flex-shrink:0;">
               <polyline points="20 6 9 17 4 12"/></svg> Correct! +${award.xpAwarded} XP`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--red-text)" stroke-width="2.2"
               style="width:14px;height:14px;flex-shrink:0;">
               <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
             Not quite — ${scenario.choices[correct]}`}
      </div>
      <div class="mkt-fb-body">${scenario.explanation}</div>`;
  }

  // Award XP on correct
  if (isCorrect) {
    _mXpTotal   += award.xpAwarded;
    S.totalCorrect++;
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof showXpPop    === 'function') showXpPop(award.xpAwarded);
  }
  S.totalAnswered++;
  save();

  // Swap buttons
  const checkBtn = document.getElementById('mktCheckBtn');
  const nextBtn  = document.getElementById('mktNextBtn');
  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn)  nextBtn.style.display  = '';
}

function _mNextScenario() {
  _mIdx++;
  _mSelected = null;
  _mLocked   = false;
  _renderScenario();
}

function _mFinish() {
  const promotion = checkPromotion({ beforeXp: _mStartXp, afterXp: S.xp });
  const box = document.getElementById('marketModalBox');
  box?.classList.remove('market-modal-box-stock-detail');
  box.innerHTML = `
    <div class="mkt-modal-header">
      <button class="mkt-close-btn" onclick="_closeMarketModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          style="width:14px;height:14px;">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="mkt-modal-title">Round Complete</div>
      <div class="mkt-modal-prog"></div>
    </div>
    <div class="mkt-prog-track">
      <div class="mkt-prog-fill" style="width:100%"></div>
    </div>

    <div class="mkt-scroll-body mkt-finish-body">
      <div class="mkt-finish-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
          style="width:22px;height:22px;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="mkt-finish-title">Nice work!</div>
      <div class="mkt-finish-sub">
        You earned <strong style="color:var(--green-text);">+${_mXpTotal} XP</strong> this round.
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="_closeMarketModal()">Done</button>
        <button class="btn btn-primary"   style="flex:1;"
          onclick="openMarketFeature('${_mFeatureId}')">Play Again</button>
      </div>
    </div>`;

  if (promotion) {
    setTimeout(() => {
      if (typeof showRankPromotion === 'function') {
        showRankPromotion(promotion.beforeLevel, promotion.afterLevel, promotion);
      } else {
        showToast(`Promoted to ${promotion.afterLevel.name}!`, 'success');
      }
    }, 300);
  }
}


// ══════════════════════════════════════════════════════════════
// PRACTICE PORTFOLIO
// ══════════════════════════════════════════════════════════════

const PRACTICE_MARKET_ASSETS = [
  {
    symbol: 'AAPL',
    name: 'Apple',
    assetType: 'stock',
    marketType: 'us',
    category: 'Consumer Tech',
    basePrice: 214.18,
    tint: '#6ca8ff',
    drift: 0.00045,
    volatility: 0.018,
    minShares: 1,
    shareStep: 1,
    lesson: 'Apple pairs hardware with recurring services revenue.'
  },
  {
    symbol: 'TSLA',
    name: 'Tesla',
    assetType: 'stock',
    marketType: 'us',
    category: 'EVs & Energy',
    basePrice: 178.44,
    tint: '#f46d5a',
    drift: 0.0003,
    volatility: 0.033,
    minShares: 1,
    shareStep: 1,
    lesson: 'Tesla is a high-volatility growth stock tied to future expectations.'
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    assetType: 'stock',
    marketType: 'us',
    category: 'Semiconductors',
    basePrice: 126.51,
    tint: '#68d391',
    drift: 0.00065,
    volatility: 0.028,
    minShares: 1,
    shareStep: 1,
    lesson: 'NVIDIA is leveraged to AI demand and data-center spending.'
  },
  {
    symbol: 'AMZN',
    name: 'Amazon',
    assetType: 'stock',
    marketType: 'us',
    category: 'E-Commerce & Cloud',
    basePrice: 182.26,
    tint: '#f1b44b',
    drift: 0.0004,
    volatility: 0.02,
    minShares: 1,
    shareStep: 1,
    lesson: 'Amazon blends retail scale with high-margin AWS cash flow.'
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet',
    assetType: 'stock',
    marketType: 'us',
    category: 'Internet & AI',
    basePrice: 171.74,
    tint: '#8b7cf6',
    drift: 0.00038,
    volatility: 0.017,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['google', 'youtube', 'search', 'alphabet'],
    lesson: 'Alphabet’s search ads fund long-term AI and cloud bets.'
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft',
    assetType: 'stock',
    marketType: 'us',
    category: 'Software & Cloud',
    basePrice: 420.0,
    tint: '#5ab0ff',
    drift: 0.0004,
    volatility: 0.016,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['azure', 'office', 'windows', 'microsoft'],
    lesson: 'Microsoft combines enterprise software cash flow with Azure cloud growth.'
  },
  {
    symbol: 'META',
    name: 'Meta Platforms',
    assetType: 'stock',
    marketType: 'us',
    category: 'Ads & Social',
    basePrice: 505.0,
    tint: '#6f87ff',
    drift: 0.00042,
    volatility: 0.021,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['facebook', 'instagram', 'meta'],
    lesson: 'Meta is driven by ad demand, engagement, and AI-powered product bets.'
  },
  {
    symbol: 'AMD',
    name: 'AMD',
    assetType: 'stock',
    marketType: 'us',
    category: 'Semiconductors',
    basePrice: 165.0,
    tint: '#7ed0a1',
    drift: 0.00045,
    volatility: 0.027,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['advanced micro devices', 'chips', 'ai'],
    lesson: 'AMD trades with chip cycles, data-center demand, and AI optimism.'
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase',
    assetType: 'stock',
    marketType: 'us',
    category: 'Banking',
    basePrice: 205.0,
    tint: '#73c6c2',
    drift: 0.0002,
    volatility: 0.014,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['jpmorgan', 'bank', 'financials'],
    lesson: 'JPMorgan reflects credit demand, rates, and the health of the banking system.'
  },
  {
    symbol: 'COST',
    name: 'Costco',
    assetType: 'stock',
    marketType: 'us',
    category: 'Consumer Staples',
    basePrice: 845.0,
    tint: '#8bd1ff',
    drift: 0.00028,
    volatility: 0.013,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['costco', 'retail', 'warehouse'],
    lesson: 'Costco blends resilient consumer demand with a membership-driven moat.'
  },
  {
    symbol: 'XOM',
    name: 'Exxon Mobil',
    assetType: 'stock',
    marketType: 'us',
    category: 'Energy',
    basePrice: 116.0,
    tint: '#f28f72',
    drift: 0.00018,
    volatility: 0.016,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['exxon', 'oil', 'energy'],
    lesson: 'Exxon Mobil moves with oil prices, refining margins, and capital discipline.'
  },
  {
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    assetType: 'etf',
    marketType: 'us',
    category: 'Broad Market ETF',
    basePrice: 503.31,
    tint: '#3fbf9a',
    drift: 0.00028,
    volatility: 0.011,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['s and p 500', 's&p 500', 'vanguard 500', 'index fund'],
    lesson: 'VOO tracks the S&P 500 and gives broad U.S. market exposure.'
  },
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    assetType: 'etf',
    marketType: 'us',
    category: 'Broad Market ETF',
    basePrice: 560.0,
    tint: '#4bc59c',
    drift: 0.00028,
    volatility: 0.011,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['spy', 's and p 500', 'spdr'],
    lesson: 'SPY is one of the most traded S&P 500 ETFs and a broad market benchmark.'
  },
  {
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    assetType: 'etf',
    marketType: 'us',
    category: 'Growth ETF',
    basePrice: 475.0,
    tint: '#7d8dff',
    drift: 0.00034,
    volatility: 0.016,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['nasdaq 100', 'qqq', 'tech etf'],
    lesson: 'QQQ concentrates on large-cap growth and Nasdaq-heavy tech exposure.'
  },
  {
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    assetType: 'etf',
    marketType: 'us',
    category: 'Total Market ETF',
    basePrice: 285.0,
    tint: '#58b8a0',
    drift: 0.00024,
    volatility: 0.01,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['total stock market', 'vanguard total market', 'vti'],
    lesson: 'VTI gives diversified exposure across the full U.S. stock market.'
  },
  {
    symbol: 'SCHD',
    name: 'Schwab U.S. Dividend Equity ETF',
    assetType: 'etf',
    marketType: 'us',
    category: 'Dividend ETF',
    basePrice: 82.0,
    tint: '#66b0ff',
    drift: 0.00018,
    volatility: 0.009,
    minShares: 1,
    shareStep: 1,
    searchTerms: ['dividend etf', 'schwab dividend', 'schd'],
    lesson: 'SCHD leans into profitable dividend growers and income-focused equity exposure.'
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    assetType: 'crypto',
    marketType: 'crypto',
    category: 'Digital Asset',
    basePrice: 64200.0,
    tint: '#f0a43b',
    drift: 0.00055,
    volatility: 0.045,
    minShares: 0.000001,
    defaultQuantity: 0.001,
    shareStep: 0.001,
    quantityPrecision: 6,
    inputStep: 0.000001,
    lesson: 'Bitcoin is scarce and volatile, with no cash flow underneath it.'
  }
];
const MARKET_MOVER_MARKET_CAP_FALLBACKS = {
  AAPL: 3300000000000,
  TSLA: 560000000000,
  NVDA: 3000000000000,
  AMZN: 2000000000000,
  GOOGL: 2100000000000,
  MSFT: 3100000000000,
  META: 1300000000000,
  AMD: 280000000000,
  JPM: 600000000000,
  COST: 380000000000,
  XOM: 500000000000
};
const CORE_PRACTICE_ASSET_SYMBOLS = new Set(PRACTICE_MARKET_ASSETS.map(asset => asset.symbol));
const PRACTICE_QUOTE_REFRESH_MS = 45000;
const PRACTICE_HISTORY_LIMIT = 720;
const PRACTICE_TRANSACTION_LIMIT = 1500;
const PRACTICE_CHART_CACHE_TTL_MS = 5 * 60 * 1000;
const PORTFOLIO_CHART_CACHE_TTL_MS = 2 * 60 * 1000;
const MARKET_SIGNAL_CARD_LIMIT = 2;
const MARKET_SEARCH_RESULT_LIMIT = 8;
const MARKET_SEARCH_MOVER_LIMIT = 8;
const MARKET_TOP_MOVER_MIN_MARKET_CAP = 5000000000;
const MARKET_TOP_MOVER_MIN_PRICE = 10;
const PORTFOLIO_CHART_TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'MAX'];
const STOCK_CHART_TIMEFRAMES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'MAX'];
const MARKET_DAILY_CHART_RANGE = '1M';
const MARKET_CHART_GUESS_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'VOO'];
const MARKET_CHART_GUESS_REWARD = { xp: 18, cash: 12 };
const MARKET_CHART_CHALLENGE_VARIANT = 'what-happened-next';
const MARKET_CHART_CHOICE_LIBRARY = {
  broke_out_higher: {
    label: 'Broke out higher',
    copy: 'Buyers kept control and pushed through the setup high.'
  },
  faded_lower: {
    label: 'Faded lower',
    copy: 'The move lost steam and drifted lower into the finish.'
  },
  stayed_flat: {
    label: 'Stayed mostly flat',
    copy: 'Price chopped sideways without a meaningful follow-through.'
  },
  reversed_sharply: {
    label: 'Reversed sharply',
    copy: 'Momentum flipped and the chart snapped the other way.'
  }
};
const MARKET_ASSET_PROFILE_STORAGE_KEY = 'finlingo_market_asset_profiles_v1';
const MARKET_BLUE_CHIP_PICKS = [
  {
    symbol: 'VOO',
    title: 'Starter ETF',
    note: 'Broad U.S. market exposure in one position.'
  },
  {
    symbol: 'AAPL',
    title: 'Blue Chip',
    note: 'Cash-rich mega-cap with resilient consumer demand.'
  },
  {
    symbol: 'GOOGL',
    title: 'Compounder',
    note: 'Search cash flow supporting cloud and AI expansion.'
  }
];
let _portfolioFetchPending = false;
let _portfolioQuoteMode = 'simulated';
let _portfolioQuoteStatus = '';
let _portfolioShareSelections = {};
let _marketSearchQuery = '';
let _marketSearchPendingSymbol = '';
let _marketSearchFocused = false;
let _portfolioFetchToken = 0;
let _portfolioRefreshTimer = null;
let _marketPortfolioRange = '1D';
let _marketPortfolioChartCache = {};
let _marketPortfolioChartPending = false;
let _marketPortfolioChartError = '';
let _marketPortfolioChartFetchToken = 0;
let _marketPortfolioChartScrubState = {
  active: false,
  pointerId: null,
  currentIndex: -1,
  range: '1D',
  width: 336,
  height: 220,
  stroke: '#ffffff',
  baseline: 0,
  points: [],
  defaultDisplay: null
};
let _portfolioDetailSymbol = null;
let _portfolioDetailRange = '1D';
let _portfolioChartCache = {};
let _portfolioChartFetchToken = 0;
let _portfolioChartPending = false;
let _portfolioChartError = '';
let _portfolioChartDebugInfo = null;
let _marketAssetProfileCache = null;
let _portfolioDetailProfilePending = false;
let _portfolioDetailProfileError = '';
let _portfolioChartScrubState = {
  active: false,
  pointerId: null,
  currentIndex: -1,
  symbol: null,
  range: '1D',
  assetType: 'stock',
  width: 336,
  height: 220,
  stroke: '#ffffff',
  baseline: 0,
  points: [],
  defaultDisplay: null
};
let _marketInvestOpenTimer = 0;
let _marketChartGuessCache = {};
let _marketChartGuessFetchPending = false;
let _marketChartGuessFetchToken = 0;
let _marketChartGuessError = '';
let _marketChartGuessModalOpen = false;

function _roundPortfolioNumber(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function _formatUsd(value, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value) || 0);
}

function _formatSignedUsd(value, digits = 0) {
  const amount = _roundDisplay(value, digits);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${_formatUsd(Math.abs(amount), digits)}`;
}

function _formatSignedPct(value) {
  const pct = _roundDisplay(value, 2);
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function _getDirectionalTone(value, epsilon = 0.0005) {
  const numeric = Number(value) || 0;
  if (numeric > epsilon) return 'up';
  if (numeric < -epsilon) return 'down';
  return 'flat';
}

function _formatUnsignedPct(value, digits = 2) {
  return `${Math.abs(_roundPortfolioNumber(value, digits)).toFixed(digits)}%`;
}

function _buildPortfolioMoveDisplay(value, percent, digits = 2) {
  const tone = _getDirectionalTone(value);
  const arrow = tone === 'up' ? '↑' : tone === 'down' ? '↓' : '•';
  return {
    tone,
    amountText: `${arrow} ${_formatUsd(Math.abs(value), digits)}`,
    percentText: _formatUnsignedPct(percent, 2),
    text: `${arrow} ${_formatUsd(Math.abs(value), digits)} · ${_formatUnsignedPct(percent, 2)}`
  };
}

function _getAssetType(assetOrSymbol) {
  const asset = typeof assetOrSymbol === 'string'
    ? _findPracticeAsset(assetOrSymbol)
    : assetOrSymbol;
  return asset?.assetType || 'stock';
}

function _isCryptoAsset(assetOrSymbol) {
  return _getAssetType(assetOrSymbol) === 'crypto';
}

function _usesWholeShareTrades(assetOrSymbol) {
  return !_isCryptoAsset(assetOrSymbol);
}

function _getAssetShareDigits(asset) {
  if (Number.isInteger(Number(asset?.quantityPrecision))) {
    return Math.max(0, Number(asset.quantityPrecision) || 0);
  }
  const step = Number(asset?.shareStep) || 1;
  const stepString = String(step);
  if (!stepString.includes('.')) return 0;
  return stepString.split('.')[1].length;
}

function _getMinimumTradeQuantity(asset) {
  return Number(asset?.minShares) || Number(asset?.shareStep) || 1;
}

function _getDefaultTradeQuantity(asset) {
  const fallback = Number(asset?.defaultQuantity);
  if (fallback > 0) return fallback;
  return _getMinimumTradeQuantity(asset);
}

function _normalizeTradeQuantity(asset, value, { clampMin = true, fallback = null } = {}) {
  if (!asset) return 0;
  const minimum = _getMinimumTradeQuantity(asset);
  const precision = _getAssetShareDigits(asset);
  let normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    normalized = Number(fallback);
  }
  if (!Number.isFinite(normalized) || normalized <= 0) {
    normalized = _getDefaultTradeQuantity(asset);
  }

  if (_usesWholeShareTrades(asset)) {
    normalized = Math.round(normalized);
  } else {
    normalized = _roundPortfolioNumber(normalized, precision);
  }

  if (clampMin) {
    normalized = Math.max(minimum, normalized);
  }

  return _roundPortfolioNumber(normalized, precision);
}

function _formatAssetQuantityValue(asset, quantity) {
  const precision = _getAssetShareDigits(asset);
  if (_usesWholeShareTrades(asset)) {
    return String(Math.max(1, Math.round(Number(quantity) || 0)));
  }
  return (Number(quantity) || 0)
    .toFixed(precision)
    .replace(/\.?0+$/, '');
}

function _formatTradeInputValue(asset, quantity) {
  const normalized = _normalizeTradeQuantity(asset, quantity, { clampMin: true });
  return _formatAssetQuantityValue(asset, normalized);
}

function _getTradeUnitLabel(asset, quantity = 0) {
  if (_isCryptoAsset(asset)) return asset.symbol;
  const whole = Math.abs((Number(quantity) || 0) - 1) < 1e-9;
  return `share${whole ? '' : 's'}`;
}

function _isAtMinimumTradeQuantity(asset, quantity) {
  const minimum = _getMinimumTradeQuantity(asset);
  return (Number(quantity) || 0) <= minimum + 1e-9;
}

function _getSelectedShareQuantity(symbol) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return 1;
  const stored = Number(_portfolioShareSelections[symbol]);
  if (stored > 0) {
    const normalized = _normalizeTradeQuantity(asset, stored, { clampMin: true, fallback: _getDefaultTradeQuantity(asset) });
    _portfolioShareSelections[symbol] = normalized;
    return normalized;
  }
  const initial = _normalizeTradeQuantity(asset, _getDefaultTradeQuantity(asset), { clampMin: true });
  _portfolioShareSelections[symbol] = initial;
  return initial;
}

function _formatTradeQuantity(asset, quantity) {
  const formatted = _formatAssetQuantityValue(asset, quantity);
  return `${formatted} ${_getTradeUnitLabel(asset, quantity)}`;
}

function _formatHoldingQuantity(symbol, quantity) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return `${Number(quantity || 0).toFixed(4)} shares`;
  return `${_formatAssetQuantityValue(asset, quantity)} ${_getTradeUnitLabel(asset, quantity)}`;
}

function _findPracticeAsset(symbol) {
  return PRACTICE_MARKET_ASSETS.find(asset => asset.symbol === symbol) || null;
}

function _normalizeMarketSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9.-]+/g, ' ')
    .trim();
}

function _getAssetTypeLabel(asset) {
  if (!asset) return 'Asset';
  if (asset.assetType === 'crypto') return 'Crypto';
  if (asset.assetType === 'etf') return 'ETF';
  return 'Stock';
}

function _loadMarketAssetProfileStore() {
  if (_marketAssetProfileCache) return _marketAssetProfileCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(MARKET_ASSET_PROFILE_STORAGE_KEY) || '{}');
    _marketAssetProfileCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    _marketAssetProfileCache = {};
  }
  return _marketAssetProfileCache;
}

function _saveMarketAssetProfileStore() {
  localStorage.setItem(MARKET_ASSET_PROFILE_STORAGE_KEY, JSON.stringify(_loadMarketAssetProfileStore()));
}

function _normalizeMarketAssetProfile(asset, profile) {
  const symbol = String(profile?.symbol || asset?.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  const companyName = String(profile?.companyName || asset?.name || symbol).trim() || symbol;
  const assetType = String(profile?.assetType || asset?.assetType || '').toLowerCase();
  const marketCap = Number(profile?.marketCap);
  return {
    symbol,
    companyName,
    ticker: symbol,
    assetType: assetType === 'etf' || assetType === 'crypto' ? assetType : 'stock',
    sector: String(profile?.sector || '').trim(),
    industry: String(profile?.industry || '').trim(),
    description: String(profile?.description || '').trim(),
    marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null,
    headquarters: String(profile?.headquarters || '').trim(),
    exchange: String(profile?.exchange || '').trim(),
    source: String(profile?.source || 'local').trim() || 'local',
    asOf: String(profile?.asOf || new Date().toISOString())
  };
}

function _getMarketAssetProfile(symbol) {
  const entry = _loadMarketAssetProfileStore()[String(symbol || '').trim().toUpperCase()];
  return entry && typeof entry === 'object' ? entry : null;
}

function _storeMarketAssetProfile(asset, profile) {
  const normalized = _normalizeMarketAssetProfile(asset, profile);
  if (!normalized?.symbol) return null;
  const store = _loadMarketAssetProfileStore();
  store[normalized.symbol] = normalized;
  _saveMarketAssetProfileStore();
  return normalized;
}

function _applyProfileToPracticeAsset(asset, profile) {
  if (!asset || !profile || asset.isCustom !== true) return false;

  let changed = false;
  const nextName = String(profile.companyName || '').trim();
  const nextType = String(profile.assetType || '').trim().toLowerCase();
  const currentTerms = Array.isArray(asset.searchTerms) ? asset.searchTerms : [];

  if (nextName && asset.name !== nextName) {
    asset.name = nextName;
    changed = true;
  }

  if ((nextType === 'stock' || nextType === 'etf') && asset.assetType !== nextType) {
    asset.assetType = nextType;
    asset.marketType = 'us';
    asset.category = `${nextType === 'etf' ? 'ETF' : 'Stock'} Search Result`;
    changed = true;
  }

  if (nextName && !currentTerms.includes(nextName)) {
    asset.searchTerms = [nextName, ...currentTerms].slice(0, 12);
    changed = true;
  }

  if (!changed) return false;
  const { portfolio } = _ensurePracticePortfolio();
  _hydratePersistedPracticeAssets(portfolio);
  if (typeof save === 'function') save();
  return true;
}

function _isMarketAssetProfileFresh(profile, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const stamp = new Date(profile?.asOf || '').getTime();
  if (!Number.isFinite(stamp) || stamp <= 0) return false;
  return (Date.now() - stamp) < ttlMs;
}

function _buildCryptoAssetOverviewProfile(asset) {
  return _normalizeMarketAssetProfile(asset, {
    symbol: asset?.symbol,
    companyName: asset?.name || asset?.symbol,
    assetType: 'crypto',
    sector: 'Digital Assets',
    industry: 'Cryptocurrency',
    description: asset?.lesson || `${asset?.symbol || 'This asset'} trades continuously and is typically driven by liquidity, risk appetite, and network adoption.`,
    marketCap: null,
    headquarters: '',
    exchange: '24/7 crypto market',
    source: 'local',
    asOf: new Date().toISOString()
  });
}

function _formatCompactMarketCap(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
  if (numeric >= 1e12) return `${_roundPortfolioNumber(numeric / 1e12, 2)}T`;
  if (numeric >= 1e9) return `${_roundPortfolioNumber(numeric / 1e9, 2)}B`;
  if (numeric >= 1e6) return `${_roundPortfolioNumber(numeric / 1e6, 1)}M`;
  return _formatUsd(numeric, 0);
}

function _getAssetDetailExtendedHoursSummary(asset, market) {
  if (!asset || _isCryptoAsset(asset)) return null;
  const status = _getAssetMarketStatus(asset);
  if (!['premarket', 'afterhours'].includes(String(status.session || ''))) return null;
  const legs = market?.extendedHours && typeof market.extendedHours === 'object'
    ? market.extendedHours
    : null;
  if (!legs) return null;
  const leg = status.session === 'premarket' ? legs.preMarket : legs.afterHours;
  const price = Number(leg?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const percent = Number(leg?.percent);
  return {
    label: status.session === 'premarket' ? 'Pre-Market' : 'After-Hours',
    priceText: _formatUsd(price, 2),
    changeText: Number.isFinite(percent) ? _formatSignedPct(percent) : '',
    tone: Number(percent || 0) >= 0 ? 'up' : 'down'
  };
}

function _normalizeExtendedHoursQuote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const normalizeLeg = leg => {
    const price = Number(leg?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const change = Number(leg?.change);
    const percent = Number(leg?.percent);
    return {
      session: String(leg?.session || '').trim() || '',
      price: _roundPortfolioNumber(price, 2),
      change: Number.isFinite(change) ? _roundPortfolioNumber(change, 2) : null,
      percent: Number.isFinite(percent) ? _roundPortfolioNumber(percent, 2) : null,
      asOf: typeof leg?.asOf === 'string' ? leg.asOf : null
    };
  };
  const preMarket = normalizeLeg(raw.preMarket);
  const afterHours = normalizeLeg(raw.afterHours);
  if (!preMarket && !afterHours) return null;
  return { preMarket, afterHours };
}

function _createGenericPracticeAsset(symbol, overrides = {}) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const resolvedAssetType = overrides.assetType || 'stock';
  return {
    symbol: upperSymbol,
    name: overrides.name || upperSymbol,
    assetType: resolvedAssetType,
    marketType: overrides.marketType || (resolvedAssetType === 'crypto' ? 'crypto' : 'us'),
    category: overrides.category || `${resolvedAssetType === 'etf' ? 'ETF' : resolvedAssetType === 'crypto' ? 'Crypto' : 'Stock'} Search Result`,
    basePrice: Number(overrides.basePrice) || 100,
    tint: overrides.tint || '#7f8ea3',
    drift: Number(overrides.drift) || 0.00025,
    volatility: Number(overrides.volatility) || 0.016,
    minShares: resolvedAssetType === 'crypto' ? 0.000001 : 1,
    defaultQuantity: resolvedAssetType === 'crypto' ? 0.001 : 1,
    shareStep: resolvedAssetType === 'crypto' ? 0.001 : 1,
    quantityPrecision: resolvedAssetType === 'crypto' ? 6 : 0,
    inputStep: resolvedAssetType === 'crypto' ? 0.000001 : 1,
    searchTerms: Array.isArray(overrides.searchTerms) ? overrides.searchTerms : [],
    lesson: overrides.lesson || `${upperSymbol} was added from search. Open the chart and inspect the price action before trading.`,
    isCustom: overrides.isCustom === true
  };
}

function _normalizeCustomPracticeAsset(asset) {
  const symbol = String(asset?.symbol || '').trim().toUpperCase();
  if (!symbol || !_looksLikeExactTicker(symbol)) return null;
  const normalized = _createGenericPracticeAsset(symbol, {
    ...asset,
    symbol,
    name: String(asset?.name || symbol),
    category: String(asset?.category || 'Search Result'),
    searchTerms: Array.isArray(asset?.searchTerms)
      ? asset.searchTerms.filter(Boolean).map(term => String(term)).slice(0, 12)
      : [],
    isCustom: true
  });
  return {
    ...normalized,
    marketType: normalized.assetType === 'crypto' ? 'crypto' : 'us'
  };
}

function _upsertPracticeAssetDefinition(asset) {
  const normalized = CORE_PRACTICE_ASSET_SYMBOLS.has(String(asset?.symbol || '').trim().toUpperCase())
    ? _findPracticeAsset(asset.symbol)
    : _normalizeCustomPracticeAsset(asset);
  if (!normalized?.symbol) return null;

  const existingIndex = PRACTICE_MARKET_ASSETS.findIndex(entry => entry.symbol === normalized.symbol);
  if (existingIndex >= 0) {
    if (CORE_PRACTICE_ASSET_SYMBOLS.has(normalized.symbol)) {
      return PRACTICE_MARKET_ASSETS[existingIndex];
    }
    PRACTICE_MARKET_ASSETS[existingIndex] = {
      ...PRACTICE_MARKET_ASSETS[existingIndex],
      ...normalized
    };
    return PRACTICE_MARKET_ASSETS[existingIndex];
  }

  PRACTICE_MARKET_ASSETS.push(normalized);
  return normalized;
}

function _hydratePersistedPracticeAssets(portfolio) {
  if (!portfolio || typeof portfolio !== 'object') return [];
  const customAssets = Array.isArray(portfolio.customAssets) ? portfolio.customAssets : [];
  const persistedBySymbol = customAssets.reduce((acc, asset) => {
    const normalized = _normalizeCustomPracticeAsset(asset);
    if (normalized?.symbol) acc[normalized.symbol] = normalized;
    return acc;
  }, {});
  const symbolCandidates = new Set([
    ...Object.keys(portfolio.assets || {}),
    ...Object.keys(portfolio.holdings || {}),
    ...(Array.isArray(portfolio.watchlist) ? portfolio.watchlist : []),
    ...Object.keys(persistedBySymbol)
  ].map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean));

  symbolCandidates.forEach(symbol => {
    if (_findPracticeAsset(symbol)) return;
    const restored = persistedBySymbol[symbol] || _createGenericPracticeAsset(symbol, {
      basePrice: Number(portfolio.assets?.[symbol]?.price) || 100,
      isCustom: true
    });
    _upsertPracticeAssetDefinition(restored);
  });

  const normalizedCustomAssets = PRACTICE_MARKET_ASSETS
    .filter(asset => !CORE_PRACTICE_ASSET_SYMBOLS.has(asset.symbol))
    .map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      marketType: asset.marketType,
      category: asset.category,
      basePrice: asset.basePrice,
      tint: asset.tint,
      drift: asset.drift,
      volatility: asset.volatility,
      minShares: asset.minShares,
      defaultQuantity: asset.defaultQuantity,
      shareStep: asset.shareStep,
      quantityPrecision: asset.quantityPrecision,
      inputStep: asset.inputStep,
      searchTerms: Array.isArray(asset.searchTerms) ? asset.searchTerms : [],
      lesson: asset.lesson,
      isCustom: true
    }));
  portfolio.customAssets = normalizedCustomAssets;
  return normalizedCustomAssets;
}

function _registerPracticeAsset(asset) {
  if (!asset?.symbol) return null;
  const normalizedAsset = CORE_PRACTICE_ASSET_SYMBOLS.has(String(asset.symbol).trim().toUpperCase())
    ? _findPracticeAsset(asset.symbol)
    : _upsertPracticeAssetDefinition(asset);
  if (!normalizedAsset) return null;

  const { portfolio } = _ensurePracticePortfolio();
  if (!portfolio.assets?.[normalizedAsset.symbol]) {
    portfolio.assets[normalizedAsset.symbol] = _createPracticeAssetState(normalizedAsset);
  }
  if (!CORE_PRACTICE_ASSET_SYMBOLS.has(normalizedAsset.symbol)) {
    _hydratePersistedPracticeAssets(portfolio);
  }
  if (typeof save === 'function') save();
  return normalizedAsset;
}

function _looksLikeExactTicker(query) {
  return /^[A-Z]{1,5}(?:[.-][A-Z]{1,3})?$/.test(String(query || '').trim().toUpperCase());
}

function _tokenizeMarketSearchText(value) {
  return _normalizeMarketSearchText(value).split(' ').filter(Boolean);
}

function _scorePracticeAssetMatch(asset, normalizedQuery) {
  if (!asset || !normalizedQuery) return -1;
  const symbol = _normalizeMarketSearchText(asset.symbol);
  const name = _normalizeMarketSearchText(asset.name);
  const category = _normalizeMarketSearchText(asset.category);
  const terms = [
    symbol,
    name,
    category,
    ...((Array.isArray(asset.searchTerms) ? asset.searchTerms : []).map(_normalizeMarketSearchText))
  ].filter(Boolean);
  const queryTokens = _tokenizeMarketSearchText(normalizedQuery);
  const haystack = terms.join(' ');

  if (symbol === normalizedQuery) return 120;
  if (name === normalizedQuery) return 110;

  const containsAllTokens = queryTokens.every(token =>
    terms.some(term => term.includes(token)) || haystack.includes(token)
  );
  if (!containsAllTokens) return -1;

  if (symbol.startsWith(normalizedQuery)) return 100;
  if (name.startsWith(normalizedQuery)) return 96;
  if (terms.some(term => term.startsWith(normalizedQuery))) return 92;
  if (queryTokens.every(token => symbol.includes(token))) return 88;
  if (queryTokens.every(token => name.includes(token))) return 84;
  if (terms.some(term => term.split(' ').includes(normalizedQuery))) return 80;
  if (terms.some(term => term.includes(normalizedQuery))) return 74;
  if (queryTokens.length > 1 && queryTokens.every(token => haystack.includes(token))) return 68;
  return -1;
}

function _buildMarketSearchResults(query) {
  const normalizedQuery = _normalizeMarketSearchText(query);
  if (!normalizedQuery) return [];

  const seen = new Set();
  const matches = PRACTICE_MARKET_ASSETS
    .map(asset => ({
      asset,
      score: _scorePracticeAssetMatch(asset, normalizedQuery)
    }))
    .filter(item => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.asset.symbol).localeCompare(String(b.asset.symbol));
    })
    .filter(item => {
      if (seen.has(item.asset.symbol)) return false;
      seen.add(item.asset.symbol);
      return true;
    })
    .slice(0, MARKET_SEARCH_RESULT_LIMIT)
    .map(item => ({
      kind: 'asset',
      symbol: item.asset.symbol,
      asset: item.asset
    }));

  const exactTicker = String(query || '').trim().toUpperCase();
  if (_looksLikeExactTicker(exactTicker) && !seen.has(exactTicker)) {
    matches.unshift({
      kind: 'exact',
      symbol: exactTicker,
      asset: _createGenericPracticeAsset(exactTicker, {
        name: 'Open exact ticker',
        category: 'Search Result'
      })
    });
  }

  return matches.slice(0, MARKET_SEARCH_RESULT_LIMIT);
}

function setMarketSearchQuery(value) {
  _marketSearchQuery = String(value || '');
  _syncMarketSearchUi();
}

function setMarketSearchFocused(focused = true) {
  const next = !!focused;
  if (_marketSearchFocused === next) return;
  _marketSearchFocused = next;
  if (next) {
    _ensureMarketQuoteHydration();
  }
  _syncMarketSearchUi();
}

function handleMarketSearchBlur(event) {
  const relatedTarget = event?.relatedTarget;
  if (relatedTarget && relatedTarget.closest?.('[data-market-search-shell="true"]')) return;
  setTimeout(() => {
    const activeWithinSearch = document.activeElement?.closest?.('[data-market-search-shell="true"]');
    if (!activeWithinSearch) setMarketSearchFocused(false);
  }, 0);
}

function clearMarketSearchQuery() {
  setMarketSearchQuery('');
}

function openMarketMover(symbol) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  if (!upperSymbol) return;
  _marketSearchQuery = '';
  _marketSearchFocused = false;
  _marketSearchPendingSymbol = '';
  _syncMarketSearchUi();
  openMarketAssetDetail(upperSymbol);
}

function focusMarketSearch() {
  setMarketSearchFocused(true);
  const shell = document.querySelector('[data-market-search-shell="true"]');
  const input = shell?.querySelector('.market-search-input') || document.querySelector('.market-search-input');
  if (shell && typeof shell.scrollIntoView === 'function') {
    shell.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (input && typeof input.focus === 'function') {
    setTimeout(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (typeof input.select === 'function') input.select();
    }, 80);
  }
}

function _restoreMarketSearchFocusIfNeeded() {
  if (!_marketSearchFocused) return;
  const input = document.querySelector('[data-market-search-shell="true"] .market-search-input')
    || document.querySelector('.market-search-input');
  if (!input || typeof input.focus !== 'function') return;
  setTimeout(() => {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }, 0);
}

async function _requestSinglePracticeQuote(symbol) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  if (!upperSymbol) throw new Error('Missing ticker');
  const payload = await _fetchMarketJson(`/api/quotes?symbols=${encodeURIComponent(upperSymbol)}`, {
    notFoundMessage: 'Quote API route not found. Serve the app with python3 server.py so /api/quotes is available.',
    invalidPayloadMessage: 'Quote payload missing'
  });
  const quote = payload?.[upperSymbol];
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(payload?._errors?.[upperSymbol] || `Live data unavailable for ${upperSymbol}`);
  }
  return quote;
}

async function openMarketSearchResult(symbol) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  if (!upperSymbol) return;
  const existingAsset = _findPracticeAsset(upperSymbol);
  if (existingAsset) {
    _marketSearchQuery = '';
    _marketSearchFocused = false;
    _syncMarketSearchUi();
    openMarketAssetDetail(upperSymbol);
    return;
  }

  if (_marketSearchPendingSymbol === upperSymbol) return;
  _marketSearchPendingSymbol = upperSymbol;
  _syncMarketSearchUi();

  try {
    const quote = await _requestSinglePracticeQuote(upperSymbol);
    const asset = _registerPracticeAsset(_createGenericPracticeAsset(upperSymbol, {
      name: upperSymbol,
      basePrice: Number(quote?.price) || 100,
      searchTerms: [upperSymbol],
      isCustom: true
    }));
    if (!asset) throw new Error(`Unable to open ${upperSymbol}`);

    const { portfolio } = _ensurePracticePortfolio();
    _applyPracticeQuoteToAssetState(portfolio, asset, quote);
    save();

    _marketSearchQuery = '';
    _marketSearchFocused = false;
    _syncMarketSearchUi();
    openMarketAssetDetail(upperSymbol);
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(err instanceof Error ? err.message : `Unable to open ${upperSymbol}`, 'error');
    }
  } finally {
    _marketSearchPendingSymbol = '';
    _syncMarketSearchUi();
  }
}

function _getUsMarketTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    weekday: parts.weekday || '',
    hour: Number(parts.hour) || 0,
    minute: Number(parts.minute) || 0
  };
}

function _getAssetMarketStatus(asset, now = new Date()) {
  if (_isCryptoAsset(asset)) {
    return {
      label: 'Crypto 24/7',
      tone: 'always-open',
      session: 'crypto'
    };
  }

  const time = _getUsMarketTimeParts(now);
  const isWeekend = ['Sat', 'Sun'].includes(time.weekday);
  if (isWeekend) {
    return {
      label: 'US Market Closed',
      tone: 'closed',
      session: 'closed'
    };
  }

  const minutes = (time.hour * 60) + time.minute;
  const regularOpen = (9 * 60) + 30;
  const regularClose = 16 * 60;
  const extendedMorning = 4 * 60;
  const extendedEvening = 20 * 60;

  if (minutes >= regularOpen && minutes < regularClose) {
    return {
      label: 'US Market Open',
      tone: 'open',
      session: 'open'
    };
  }
  if (minutes >= extendedMorning && minutes < regularOpen) {
    return {
      label: 'Pre-Market',
      tone: 'extended',
      session: 'premarket'
    };
  }
  if (minutes >= regularClose && minutes < extendedEvening) {
    return {
      label: 'After-Hours',
      tone: 'extended',
      session: 'afterhours'
    };
  }
  return {
    label: 'US Market Closed',
    tone: 'closed',
    session: 'closed'
  };
}

function _renderAssetMarketStatusBadge(asset, { compact = false } = {}) {
  const status = _getAssetMarketStatus(asset);
  return `<span class="market-status-badge market-status-badge-${status.tone}${compact ? ' compact' : ''}">${status.label}</span>`;
}

function _getStockChartRangeLabel(range) {
  switch (String(range || '').toUpperCase()) {
    case '1D':
      return 'Today';
    case '1W':
      return 'Past week';
    case '1M':
      return 'Past month';
    case '3M':
      return 'Past 3 months';
    case 'YTD':
      return 'Year to date';
    case '1Y':
      return 'Past year';
    case '5Y':
      return 'Past 5 years';
    case 'MAX':
      return 'Max';
    default:
      return range || 'Range';
  }
}

function _formatChartUpdateTime(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function _resetPracticeChartScrubModel() {
  _portfolioChartScrubState = {
    active: false,
    pointerId: null,
    currentIndex: -1,
    symbol: null,
    range: '1D',
    assetType: 'stock',
    width: 336,
    height: 220,
    stroke: '#ffffff',
    baseline: 0,
    points: [],
    defaultDisplay: null
  };
}

function _setPracticeChartScrubModel({
  asset,
  range,
  chart,
  priceText,
  changeText,
  changePositive,
  statusText
} = {}) {
  if (!asset || !chart || !Array.isArray(chart.scrubPoints) || !chart.scrubPoints.length) {
    _resetPracticeChartScrubModel();
    return;
  }
  _portfolioChartScrubState = {
    active: false,
    pointerId: null,
    currentIndex: -1,
    symbol: asset.symbol,
    range: range || '1D',
    assetType: _getAssetType(asset),
    width: Number(chart.width) || 336,
    height: Number(chart.height) || 220,
    stroke: chart.stroke || '#ffffff',
    baseline: Number(chart.firstValue) || 0,
    points: chart.scrubPoints,
    defaultDisplay: {
      priceText: String(priceText || ''),
      changeText: String(changeText || ''),
      changePositive: !!changePositive,
      statusText: String(statusText || '')
    }
  };
}

function _getPracticeChartScrubElements() {
  return {
    stage: document.getElementById('marketStockChartStage'),
    price: document.getElementById('marketStockChartPrice'),
    change: document.getElementById('marketStockChartChange'),
    status: document.getElementById('marketStockChartStatus'),
    metaMove: document.getElementById('marketStockChartMetaMoveValue'),
    scrubLine: document.getElementById('marketStockChartScrubLine'),
    scrubHalo: document.getElementById('marketStockChartScrubHalo'),
    scrubDot: document.getElementById('marketStockChartScrubDot'),
    currentHalo: document.getElementById('marketStockChartCurrentHalo'),
    currentDot: document.getElementById('marketStockChartCurrentDot')
  };
}

function _formatPracticeChartScrubTimestamp(timeValue, range, assetType) {
  const parsed = new Date(Number(timeValue) || 0);
  if (Number.isNaN(parsed.getTime())) return '';
  const useEastern = assetType !== 'crypto';
  const timeZoneOptions = useEastern ? { timeZone: 'America/New_York' } : {};
  const rangeKey = String(range || '').toUpperCase();
  let options = { hour: 'numeric', minute: '2-digit' };
  if (rangeKey === '1W') {
    options = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  } else if (rangeKey === '1M') {
    options = assetType === 'crypto'
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric' };
  } else if (rangeKey === '3M' || rangeKey === 'YTD') {
    options = { month: 'short', day: 'numeric' };
  } else if (rangeKey === '1Y') {
    options = { month: 'short', day: 'numeric', year: 'numeric' };
  } else if (rangeKey === '5Y' || rangeKey === 'MAX') {
    options = { month: 'short', year: 'numeric' };
  }
  return new Intl.DateTimeFormat('en-US', {
    ...timeZoneOptions,
    ...options
  }).format(parsed);
}

function _resetMarketPortfolioChartScrubModel() {
  _marketPortfolioChartScrubState = {
    active: false,
    pointerId: null,
    currentIndex: -1,
    range: '1D',
    width: 336,
    height: 220,
    stroke: '#ffffff',
    baseline: 0,
    points: [],
    defaultDisplay: null
  };
}

function _setMarketPortfolioChartScrubModel({
  range,
  chart,
  valueText,
  changeText,
  changeTone,
  statusText
} = {}) {
  if (!chart || !Array.isArray(chart.scrubPoints) || !chart.scrubPoints.length) {
    _resetMarketPortfolioChartScrubModel();
    return;
  }
  _marketPortfolioChartScrubState = {
    active: false,
    pointerId: null,
    currentIndex: -1,
    range: range || '1D',
    width: Number(chart.width) || 336,
    height: Number(chart.height) || 220,
    stroke: chart.stroke || '#ffffff',
    baseline: Number(chart.firstValue) || 0,
    points: chart.scrubPoints,
    defaultDisplay: {
      valueText: String(valueText || ''),
      changeText: String(changeText || ''),
      changeTone: String(changeTone || 'flat'),
      statusText: String(statusText || '')
    }
  };
}

function _getMarketPortfolioChartScrubElements() {
  return {
    stage: document.getElementById('marketPortfolioChartStage'),
    value: document.getElementById('marketPortfolioChartValue'),
    change: document.getElementById('marketPortfolioChartChange'),
    status: document.getElementById('marketPortfolioChartStatus'),
    scrubLine: document.getElementById('marketPortfolioChartScrubLine'),
    scrubHalo: document.getElementById('marketPortfolioChartScrubHalo'),
    scrubDot: document.getElementById('marketPortfolioChartScrubDot'),
    currentHalo: document.getElementById('marketPortfolioChartCurrentHalo'),
    currentDot: document.getElementById('marketPortfolioChartCurrentDot')
  };
}

function _restoreMarketPortfolioChartScrubUi() {
  const state = _marketPortfolioChartScrubState;
  const elements = _getMarketPortfolioChartScrubElements();
  if (!elements.stage) return;

  const defaults = state.defaultDisplay || null;
  if (defaults) {
    if (elements.value) elements.value.textContent = defaults.valueText;
    if (elements.change) {
      elements.change.textContent = defaults.changeText;
      elements.change.className = `market-portfolio-hero-change ${defaults.changeTone}`;
    }
    if (elements.status) elements.status.textContent = defaults.statusText;
  }

  elements.stage.classList.remove('is-scrubbing');
  if (elements.scrubLine) elements.scrubLine.style.opacity = '0';
  if (elements.scrubHalo) elements.scrubHalo.style.opacity = '0';
  if (elements.scrubDot) elements.scrubDot.style.opacity = '0';
  if (elements.currentHalo) elements.currentHalo.style.opacity = '1';
  if (elements.currentDot) elements.currentDot.style.opacity = '1';
}

function _applyMarketPortfolioChartScrubPoint(index) {
  const state = _marketPortfolioChartScrubState;
  if (!Array.isArray(state.points) || !state.points.length) return;
  const safeIndex = Math.max(0, Math.min(state.points.length - 1, index));
  if (safeIndex === state.currentIndex && state.active) return;

  const point = state.points[safeIndex];
  const elements = _getMarketPortfolioChartScrubElements();
  if (!elements.stage || !elements.value || !elements.change || !elements.status) return;

  const value = Number(point?.value) || 0;
  const baseline = Number(state.baseline) > 0 ? Number(state.baseline) : value;
  const change = _roundPortfolioNumber(value - baseline, 2);
  const changePct = baseline > 0
    ? _roundPortfolioNumber((change / baseline) * 100, 2)
    : 0;
  const moveDisplay = _buildPortfolioMoveDisplay(change, changePct, 2);

  state.active = true;
  state.currentIndex = safeIndex;
  elements.stage.classList.add('is-scrubbing');
  elements.value.textContent = _formatUsd(value, 2);
  elements.change.textContent = moveDisplay.text;
  elements.change.className = `market-portfolio-hero-change ${moveDisplay.tone}`;
  elements.status.textContent = _formatPracticeChartScrubTimestamp(point.time, state.range, 'portfolio');
  if (elements.scrubLine) {
    elements.scrubLine.setAttribute('x1', point.x);
    elements.scrubLine.setAttribute('x2', point.x);
    elements.scrubLine.setAttribute('y1', '0');
    elements.scrubLine.setAttribute('y2', String(state.height));
    elements.scrubLine.style.opacity = '1';
  }
  if (elements.scrubHalo) {
    elements.scrubHalo.setAttribute('cx', point.x);
    elements.scrubHalo.setAttribute('cy', point.y);
    elements.scrubHalo.setAttribute('fill', state.stroke);
    elements.scrubHalo.style.opacity = '1';
  }
  if (elements.scrubDot) {
    elements.scrubDot.setAttribute('cx', point.x);
    elements.scrubDot.setAttribute('cy', point.y);
    elements.scrubDot.setAttribute('fill', state.stroke);
    elements.scrubDot.style.opacity = '1';
  }
  if (elements.currentHalo) elements.currentHalo.style.opacity = '0';
  if (elements.currentDot) elements.currentDot.style.opacity = '0';
}

function _updateMarketPortfolioChartScrubFromClientX(clientX) {
  const state = _marketPortfolioChartScrubState;
  const elements = _getMarketPortfolioChartScrubElements();
  if (!elements.stage || !Array.isArray(state.points) || !state.points.length) return;
  const rect = elements.stage.getBoundingClientRect();
  if (!rect.width) return;
  const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const chartX = (relativeX / rect.width) * state.width;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.points.forEach((point, index) => {
    const distance = Math.abs((Number(point?.x) || 0) - chartX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  _applyMarketPortfolioChartScrubPoint(nearestIndex);
}

function startMarketPortfolioChartScrub(event) {
  const state = _marketPortfolioChartScrubState;
  if (!state.points.length) return;
  const stage = event?.currentTarget || _getMarketPortfolioChartScrubElements().stage;
  if (!stage) return;
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  state.pointerId = Number.isInteger(event?.pointerId) ? event.pointerId : null;
  if (state.pointerId !== null && typeof stage.setPointerCapture === 'function') {
    try {
      stage.setPointerCapture(state.pointerId);
    } catch {}
  }
  _updateMarketPortfolioChartScrubFromClientX(Number(event?.clientX) || 0);
}

function moveMarketPortfolioChartScrub(event) {
  const state = _marketPortfolioChartScrubState;
  if (!state.active && state.pointerId === null) return;
  if (state.pointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== state.pointerId) return;
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  _updateMarketPortfolioChartScrubFromClientX(Number(event?.clientX) || 0);
}

function endMarketPortfolioChartScrub(event) {
  const state = _marketPortfolioChartScrubState;
  if (state.pointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== state.pointerId) return;
  const stage = event?.currentTarget || _getMarketPortfolioChartScrubElements().stage;
  if (stage && state.pointerId !== null && typeof stage.releasePointerCapture === 'function') {
    try {
      stage.releasePointerCapture(state.pointerId);
    } catch {}
  }
  state.active = false;
  state.pointerId = null;
  state.currentIndex = -1;
  _restoreMarketPortfolioChartScrubUi();
}

function _restorePracticeChartScrubUi() {
  const state = _portfolioChartScrubState;
  const elements = _getPracticeChartScrubElements();
  if (!elements.stage) return;

  const defaults = state.defaultDisplay || null;
  if (defaults) {
    if (elements.price) elements.price.textContent = defaults.priceText;
    if (elements.change) {
      elements.change.textContent = defaults.changeText;
      elements.change.className = `market-stock-chart-change ${defaults.changePositive ? 'up' : 'down'}`;
    }
    if (elements.status) elements.status.textContent = defaults.statusText;
    if (elements.metaMove) {
      elements.metaMove.textContent = defaults.changeText;
      elements.metaMove.className = defaults.changePositive ? 'up' : 'down';
    }
  }

  elements.stage.classList.remove('is-scrubbing');
  if (elements.scrubLine) elements.scrubLine.style.opacity = '0';
  if (elements.scrubHalo) elements.scrubHalo.style.opacity = '0';
  if (elements.scrubDot) elements.scrubDot.style.opacity = '0';
  if (elements.currentHalo) elements.currentHalo.style.opacity = '1';
  if (elements.currentDot) elements.currentDot.style.opacity = '1';
}

function _applyPracticeChartScrubPoint(index) {
  const state = _portfolioChartScrubState;
  if (!Array.isArray(state.points) || !state.points.length) return;
  const safeIndex = Math.max(0, Math.min(state.points.length - 1, index));
  if (safeIndex === state.currentIndex && state.active) return;

  const point = state.points[safeIndex];
  const elements = _getPracticeChartScrubElements();
  if (!elements.stage || !elements.price || !elements.change || !elements.status) return;

  const price = Number(point?.value) || 0;
  const baseline = Number(state.baseline) > 0 ? Number(state.baseline) : price;
  const change = _roundPortfolioNumber(price - baseline, 2);
  const changePct = baseline > 0
    ? _roundPortfolioNumber((change / baseline) * 100, 2)
    : 0;
  const positive = change >= 0;

  state.active = true;
  state.currentIndex = safeIndex;
  elements.stage.classList.add('is-scrubbing');
  elements.price.textContent = _formatUsd(price, 2);
  elements.change.textContent = `${_formatSignedUsd(change, 2)} · ${_formatSignedPct(changePct)}`;
  elements.change.className = `market-stock-chart-change ${positive ? 'up' : 'down'}`;
  elements.status.textContent = _formatPracticeChartScrubTimestamp(point.time, state.range, state.assetType);
  if (elements.metaMove) {
    elements.metaMove.textContent = `${_formatSignedUsd(change, 2)} · ${_formatSignedPct(changePct)}`;
    elements.metaMove.className = positive ? 'up' : 'down';
  }
  if (elements.scrubLine) {
    elements.scrubLine.setAttribute('x1', point.x);
    elements.scrubLine.setAttribute('x2', point.x);
    elements.scrubLine.setAttribute('y1', '0');
    elements.scrubLine.setAttribute('y2', String(state.height));
    elements.scrubLine.style.opacity = '1';
  }
  if (elements.scrubHalo) {
    elements.scrubHalo.setAttribute('cx', point.x);
    elements.scrubHalo.setAttribute('cy', point.y);
    elements.scrubHalo.setAttribute('fill', state.stroke);
    elements.scrubHalo.style.opacity = '1';
  }
  if (elements.scrubDot) {
    elements.scrubDot.setAttribute('cx', point.x);
    elements.scrubDot.setAttribute('cy', point.y);
    elements.scrubDot.setAttribute('fill', state.stroke);
    elements.scrubDot.style.opacity = '1';
  }
  if (elements.currentHalo) elements.currentHalo.style.opacity = '0';
  if (elements.currentDot) elements.currentDot.style.opacity = '0';
}

function _updatePracticeChartScrubFromClientX(clientX) {
  const state = _portfolioChartScrubState;
  const elements = _getPracticeChartScrubElements();
  if (!elements.stage || !Array.isArray(state.points) || !state.points.length) return;
  const rect = elements.stage.getBoundingClientRect();
  if (!rect.width) return;
  const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const chartX = (relativeX / rect.width) * state.width;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.points.forEach((point, index) => {
    const distance = Math.abs((Number(point?.x) || 0) - chartX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  _applyPracticeChartScrubPoint(nearestIndex);
}

function startPracticeChartScrub(event) {
  const state = _portfolioChartScrubState;
  if (!_portfolioDetailSymbol || !state.points.length) return;
  const stage = event?.currentTarget || _getPracticeChartScrubElements().stage;
  if (!stage) return;
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  state.pointerId = Number.isInteger(event?.pointerId) ? event.pointerId : null;
  if (state.pointerId !== null && typeof stage.setPointerCapture === 'function') {
    try {
      stage.setPointerCapture(state.pointerId);
    } catch {}
  }
  _updatePracticeChartScrubFromClientX(Number(event?.clientX) || 0);
}

function movePracticeChartScrub(event) {
  const state = _portfolioChartScrubState;
  if (!state.active && state.pointerId === null) return;
  if (state.pointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== state.pointerId) return;
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  _updatePracticeChartScrubFromClientX(Number(event?.clientX) || 0);
}

function endPracticeChartScrub(event) {
  const state = _portfolioChartScrubState;
  if (state.pointerId !== null && Number.isInteger(event?.pointerId) && event.pointerId !== state.pointerId) return;
  const stage = event?.currentTarget || _getPracticeChartScrubElements().stage;
  if (stage && state.pointerId !== null && typeof stage.releasePointerCapture === 'function') {
    try {
      stage.releasePointerCapture(state.pointerId);
    } catch {}
  }
  state.active = false;
  state.pointerId = null;
  state.currentIndex = -1;
  _restorePracticeChartScrubUi();
}

function _getPracticeHolding(symbol) {
  const { portfolio } = _ensurePracticePortfolio();
  return portfolio.holdings?.[symbol] || null;
}

function _getPracticeChartCacheKey(symbol, range) {
  return `${symbol}:${range}`;
}

function _getPracticeChartSeries(symbol = _portfolioDetailSymbol, range = _portfolioDetailRange) {
  if (!symbol || !range) return null;
  return _portfolioChartCache[_getPracticeChartCacheKey(symbol, range)] || null;
}

function _isMarketDebugContext() {
  return new URLSearchParams(window?.location?.search || '').has('marketDebug');
}

function _debugMarketHistory(event, payload) {
  if (!_isMarketDebugContext()) return;
  console.debug(`[market-history] ${event}`, payload);
}

function _isPracticeChartCacheFresh(entry) {
  const fetchedAt = Number(entry?._fetchedAt) || 0;
  return !!(entry?.points?.length && fetchedAt > 0 && (Date.now() - fetchedAt) < PRACTICE_CHART_CACHE_TTL_MS);
}

function _getPracticeHoldingSnapshot(summary, symbol) {
  const derived = summary.holdings.find(holding => holding.symbol === symbol) || null;
  if (!derived) return null;
  const raw = summary.portfolio.holdings?.[symbol] || {};
  return {
    ...derived,
    lots: Math.max(0, Number(raw.lots) || 0),
    averageCost: derived.quantity > 0
      ? _roundPortfolioNumber((Number(derived.totalCost) || 0) / derived.quantity, 2)
      : 0
  };
}

function _buildPracticeStockChartGraphic(series) {
  const rawPoints = (series?.points || [])
    .map(point => ({
      time: Number(point?.time) || 0,
      value: Number(point?.value) || 0
    }))
    .filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value));

  if (!rawPoints.length) return null;

  const points = rawPoints.length >= 2
    ? rawPoints
    : [
        { time: rawPoints[0].time - 1, value: rawPoints[0].value },
        rawPoints[0]
      ];

  const values = points.map(point => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const paddedRange = Math.max(
    (maxValue - minValue) * 0.025,
    maxValue * 0.001,
    0.03
  );
  const low = Math.max(0, minValue - paddedRange);
  const high = maxValue + paddedRange;
  const valueRange = high - low || 1;
  const explicitDomainStart = Number(series?.domainStart) || 0;
  const explicitDomainEnd = Number(series?.domainEnd) || 0;
  const minTime = explicitDomainStart > 0 ? explicitDomainStart : points[0].time;
  const maxTime = explicitDomainEnd > minTime
    ? explicitDomainEnd
    : Math.max(points[points.length - 1].time, minTime + 1);
  const timeRange = maxTime - minTime || 1;
  const width = 336;
  const height = 220;
  const topInset = 16;
  const bottomInset = 22;
  const mappedPoints = points.map(point => {
    const x = points.length === 1
      ? width / 2
      : ((point.time - minTime) / timeRange) * width;
    const y = height - bottomInset - (((point.value - low) / valueRange) * (height - topInset - bottomInset));
    return {
      time: point.time,
      value: point.value,
      x: _roundPortfolioNumber(x, 1),
      y: _roundPortfolioNumber(y, 1)
    };
  });
  const linePoints = mappedPoints.map(point => `${point.x},${point.y}`);
  const areaPath = `M ${linePoints.join(' L ')} L ${width},${height} L 0,${height} Z`;
  const firstValue = points[0].value;
  const lastValue = points[points.length - 1].value;
  const rangeChange = lastValue - firstValue;
  const rangeChangePct = firstValue > 0
    ? (rangeChange / firstValue) * 100
    : 0;
  const positive = rangeChange >= 0;
  const lastPoint = mappedPoints[mappedPoints.length - 1] || { x: width, y: height / 2 };
  return {
    width,
    height,
    polyline: linePoints.join(' '),
    areaPath,
    stroke: positive ? '#ffffff' : '#f06a4a',
    fillStart: positive ? 'rgba(255, 255, 255, 0.16)' : 'rgba(240, 106, 74, 0.14)',
    fillEnd: positive ? 'rgba(255, 255, 255, 0.01)' : 'rgba(240, 106, 74, 0.01)',
    rangeChange,
    rangeChangePct,
    firstValue,
    lastValue,
    lastPoint,
    scrubPoints: mappedPoints,
    guideLines: [
      _roundPortfolioNumber(topInset, 1),
      _roundPortfolioNumber(height / 2, 1),
      _roundPortfolioNumber(height - bottomInset, 1)
    ],
    low: minValue,
    high: maxValue
  };
}

async function _requestPracticeStockHistory(symbol, range) {
  const requestedRange = STOCK_CHART_TIMEFRAMES.includes(range) ? range : '1D';
  const path = `/api/stock-history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(requestedRange)}`;
  _debugMarketHistory('frontend_request', { symbol, range: requestedRange, path });
  const payload = await _fetchMarketJson(
    path,
    {
      notFoundMessage: 'Chart API route not found. Serve the app with python3 server.py so /api/stock-history is available.',
      invalidPayloadMessage: 'Chart payload missing'
    }
  );
  if (!payload || !Array.isArray(payload.points)) {
    throw new Error('Chart payload missing');
  }
  const rawPoints = payload.points;
  const normalizedPoints = rawPoints
    .map(point => ({
      time: Number(point?.time) || 0,
      value: Number(point?.value)
    }))
    .filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
  const dedupedPoints = [];
  normalizedPoints.forEach(point => {
    const previous = dedupedPoints[dedupedPoints.length - 1];
    if (previous?.time === point.time) dedupedPoints[dedupedPoints.length - 1] = point;
    else dedupedPoints.push(point);
  });
  if (!dedupedPoints.length) {
    throw new Error('Chart payload contained no valid points');
  }
  const debug = {
    symbol,
    range: requestedRange,
    path,
    pointCount: dedupedPoints.length,
    returnedPointCount: rawPoints.length,
    interval: payload.interval || '',
    upstreamRange: payload.upstreamRange || '',
    firstPoints: dedupedPoints.slice(0, 3),
    debug: payload.debug || null
  };
  _debugMarketHistory('frontend_response', debug);
  return {
    ...payload,
    range: requestedRange,
    domainStart: Number(payload?.domainStart) || null,
    domainEnd: Number(payload?.domainEnd) || null,
    rawPointCount: rawPoints.length,
    validPointCount: dedupedPoints.length,
    points: dedupedPoints,
    debug: payload.debug || null,
    _debug: debug,
    _fetchedAt: Date.now()
  };
}

async function refreshPracticeStockHistory(force = false) {
  const symbol = _portfolioDetailSymbol;
  const range = _portfolioDetailRange;
  if (!symbol || !range) return null;

  const cacheKey = _getPracticeChartCacheKey(symbol, range);
  if (!force && _isPracticeChartCacheFresh(_portfolioChartCache[cacheKey])) {
    return _portfolioChartCache[cacheKey];
  }

  const token = ++_portfolioChartFetchToken;
  _portfolioChartPending = true;
  _portfolioChartError = '';
  _portfolioChartDebugInfo = {
    symbol,
    range,
    pointCount: 0,
    debug: { rawStatus: 'loading' }
  };
  _renderActivePracticeStockDetailSheet();

  try {
    const payload = await _requestPracticeStockHistory(symbol, range);
    if (token !== _portfolioChartFetchToken) return null;
    _portfolioChartCache[cacheKey] = payload;
    _portfolioChartDebugInfo = payload._debug || null;
    return payload;
  } catch (err) {
    if (token !== _portfolioChartFetchToken) return null;
    _portfolioChartError = err instanceof Error ? err.message : 'Unable to load chart';
    _portfolioChartDebugInfo = {
      symbol,
      range,
      pointCount: 0,
      error: _portfolioChartError,
      debug: { rawStatus: 'error' }
    };
    _debugMarketHistory('frontend_error', _portfolioChartDebugInfo);
    return null;
  } finally {
    if (token === _portfolioChartFetchToken) {
      _portfolioChartPending = false;
      _renderActivePracticeStockDetailSheet();
    }
  }
}

function openPracticeStockDetail(symbol) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return;
  _resetPracticeChartScrubModel();
  _portfolioDetailSymbol = symbol;
  _portfolioDetailRange = STOCK_CHART_TIMEFRAMES.includes(_portfolioDetailRange) ? _portfolioDetailRange : '1D';
  _portfolioChartError = '';
  _portfolioChartDebugInfo = null;
  _portfolioDetailProfileError = '';
  _renderActivePracticeStockDetailSheet();
  refreshPracticeAssetProfile(symbol, false);
  refreshPracticeStockHistory(true);
}

function closePracticeStockDetail() {
  if (_isStandaloneStockDetailOpen()) {
    _closeMarketModal();
    return;
  }
  _resetPracticeChartScrubModel();
  _portfolioChartFetchToken += 1;
  _portfolioDetailSymbol = null;
  _portfolioDetailRange = '1D';
  _portfolioChartPending = false;
  _portfolioChartError = '';
  _portfolioChartDebugInfo = null;
  _portfolioDetailProfilePending = false;
  _portfolioDetailProfileError = '';
  _renderActivePracticeStockDetailSheet();
}

function setPracticeStockTimeframe(range) {
  if (!_portfolioDetailSymbol || !STOCK_CHART_TIMEFRAMES.includes(range)) return;
  _resetPracticeChartScrubModel();
  _portfolioDetailRange = range;
  _portfolioChartError = '';
  _portfolioChartDebugInfo = null;
  _renderActivePracticeStockDetailSheet();
  refreshPracticeStockHistory(false);
}

function _createPracticeAssetState(asset) {
  return {
    symbol: asset.symbol,
    price: asset.basePrice,
    previousClose: asset.basePrice,
    dailyChange: 0,
    dailyChangePct: 0,
    extendedHours: null,
    updatedOn: new Date().toISOString()
  };
}

function _getPracticePortfolioDefaults() {
  if (typeof getDefaultPortfolio === 'function') return getDefaultPortfolio();
  return {
    version: 2,
    lastPriceRefreshOn: null,
    lastSimulatedAt: null,
    allTimeHigh: 0,
    allTimeHighOn: null,
    assets: {},
    holdings: {},
    history: [],
    transactions: []
  };
}

function _normalizePortfolioTransactionTime(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const stamp = new Date(value || '').getTime();
  return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
}

function _normalizePracticePortfolioTransaction(entry) {
  const type = ['cash', 'buy', 'sell'].includes(String(entry?.type || '').trim().toLowerCase())
    ? String(entry.type).trim().toLowerCase()
    : '';
  if (!type) return null;

  const time = _normalizePortfolioTransactionTime(entry?.time || entry?.recordedAt || entry?.awardedAt || entry?.createdAt);
  if (!Number.isFinite(time) || time <= 0) return null;

  const id = String(entry?.id || `${type}:${time}`).trim();
  if (!id) return null;

  const normalized = {
    id,
    type,
    time,
    source: String(entry?.source || '').trim() || 'portfolio',
    meta: entry?.meta && typeof entry.meta === 'object' ? entry.meta : null
  };

  if (type === 'cash') {
    const amount = _roundPortfolioNumber(Number(entry?.amount) || 0, 2);
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.009) return null;
    normalized.amount = amount;
    return normalized;
  }

  const symbol = String(entry?.symbol || '').trim().toUpperCase();
  const quantity = _roundPortfolioNumber(Math.max(0, Number(entry?.quantity) || 0), 6);
  const amount = _roundPortfolioNumber(Math.max(0, Number(entry?.amount) || 0), 2);
  if (!symbol || quantity <= 0 || amount <= 0) return null;
  normalized.symbol = symbol;
  normalized.quantity = quantity;
  normalized.amount = amount;
  normalized.price = _roundPortfolioNumber(Math.max(0, Number(entry?.price) || (quantity > 0 ? amount / quantity : 0)), 4);
  return normalized;
}

function _trimPracticePortfolioTransactions(transactions) {
  const normalized = (Array.isArray(transactions) ? transactions : [])
    .map(_normalizePracticePortfolioTransaction)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
  const deduped = [];
  const seen = new Set();
  normalized.forEach(entry => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    deduped.push(entry);
  });
  return deduped.slice(-PRACTICE_TRANSACTION_LIMIT);
}

function _backfillPortfolioRewardTransactions(portfolio) {
  const rewardHistory = Array.isArray(S.rewardsSummary?.history) ? S.rewardsSummary.history : [];
  if (!rewardHistory.length) return false;
  const existingIds = new Set((portfolio.transactions || []).map(entry => entry?.id).filter(Boolean));
  let changed = false;

  rewardHistory.forEach(entry => {
    const amount = _roundPortfolioNumber(Number(entry?.cashAwarded) || 0, 2);
    const time = _normalizePortfolioTransactionTime(entry?.awardedAt);
    if (amount <= 0 || time <= 0) return;
    const rewardId = String(entry?.rewardId || '').trim();
    const id = rewardId
      ? `cash:${rewardId}`
      : `cash:reward:${String(entry?.source || 'reward').trim()}:${time}:${Math.round(amount * 100)}`;
    if (existingIds.has(id)) return;
    portfolio.transactions.push({
      id,
      type: 'cash',
      time,
      amount,
      source: String(entry?.source || '').trim() || 'reward',
      meta: rewardId ? { rewardId } : null
    });
    existingIds.add(id);
    changed = true;
  });

  return changed;
}

function _backfillPortfolioHoldingTransactions(portfolio) {
  const existingBuySymbols = new Set((portfolio.transactions || [])
    .filter(entry => entry?.type === 'buy' && entry?.symbol)
    .map(entry => entry.symbol));
  let changed = false;

  Object.values(portfolio.holdings || {}).forEach(holding => {
    const symbol = String(holding?.symbol || '').trim().toUpperCase();
    const quantity = _roundPortfolioNumber(Number(holding?.quantity) || 0, 6);
    const amount = _roundPortfolioNumber(Number(holding?.totalCost) || 0, 2);
    if (!symbol || quantity <= 0 || amount <= 0 || existingBuySymbols.has(symbol)) return;
    const time = _normalizePortfolioTransactionTime(
      holding?.lastBoughtAt
      || portfolio.lastSimulatedAt
      || portfolio.history?.[portfolio.history.length - 1]?.time
      || Date.now()
    );
    portfolio.transactions.push({
      id: `buy:backfill:${symbol}:${time}:${Math.round(quantity * 1000000)}`,
      type: 'buy',
      time,
      symbol,
      quantity,
      amount,
      price: _roundPortfolioNumber(amount / quantity, 4),
      source: 'backfill',
      meta: { backfilled: true }
    });
    existingBuySymbols.add(symbol);
    changed = true;
  });

  return changed;
}

function _invalidateMarketPortfolioChart({ rerender = false } = {}) {
  _marketPortfolioChartCache = {};
  _marketPortfolioChartError = '';
  if (!rerender) return;
  if (_isMarketScreenActive() && typeof renderMarket === 'function') renderMarket();
  _renderActivePracticeStockDetailSheet();
}

function recordPortfolioCashFlow(amount, {
  source = 'cash_flow',
  rewardId = '',
  recordedAt = '',
  meta = null,
  rerender = false
} = {}) {
  const normalizedAmount = _roundPortfolioNumber(Number(amount) || 0, 2);
  if (!Number.isFinite(normalizedAmount) || Math.abs(normalizedAmount) < 0.009) return null;
  const { portfolio } = _ensurePracticePortfolio();
  const time = _normalizePortfolioTransactionTime(recordedAt) || Date.now();
  const id = rewardId
    ? `cash:${String(rewardId).trim()}`
    : `cash:${String(source || 'cash_flow').trim()}:${time}:${Math.round(normalizedAmount * 100)}`;

  if ((portfolio.transactions || []).some(entry => entry?.id === id)) {
    return portfolio.transactions.find(entry => entry?.id === id) || null;
  }

  const entry = _normalizePracticePortfolioTransaction({
    id,
    type: 'cash',
    time,
    amount: normalizedAmount,
    source,
    meta
  });
  if (!entry) return null;

  portfolio.transactions = _trimPracticePortfolioTransactions([...(portfolio.transactions || []), entry]);
  _recordPracticePortfolioHistory();
  _invalidateMarketPortfolioChart({ rerender });
  return entry;
}

function _recordPortfolioTrade(type, asset, quantity, amount, price, {
  recordedAt = '',
  source = 'trade',
  rerender = false
} = {}) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (!['buy', 'sell'].includes(normalizedType) || !asset?.symbol) return null;
  const normalizedQuantity = _roundPortfolioNumber(Math.max(0, Number(quantity) || 0), 6);
  const normalizedAmount = _roundPortfolioNumber(Math.max(0, Number(amount) || 0), 2);
  const normalizedPrice = _roundPortfolioNumber(Math.max(0, Number(price) || 0), 4);
  if (normalizedQuantity <= 0 || normalizedAmount <= 0) return null;

  const { portfolio } = _ensurePracticePortfolio();
  const time = _normalizePortfolioTransactionTime(recordedAt) || Date.now();
  const entry = _normalizePracticePortfolioTransaction({
    id: `${normalizedType}:${asset.symbol}:${time}:${Math.round(normalizedQuantity * 1000000)}`,
    type: normalizedType,
    time,
    symbol: asset.symbol,
    quantity: normalizedQuantity,
    amount: normalizedAmount,
    price: normalizedPrice,
    source
  });
  if (!entry) return null;

  portfolio.transactions = _trimPracticePortfolioTransactions([...(portfolio.transactions || []), entry]);
  _recordPracticePortfolioHistory();
  _invalidateMarketPortfolioChart({ rerender });
  return entry;
}

function _ensurePracticePortfolio() {
  let changed = false;
  if (!S.portfolio || typeof S.portfolio !== 'object' || S.portfolio.version !== 2) {
    S.portfolio = _getPracticePortfolioDefaults();
    changed = true;
  }

  const portfolio = S.portfolio;
  if (!portfolio.assets || typeof portfolio.assets !== 'object') {
    portfolio.assets = {};
    changed = true;
  }
  if (!portfolio.holdings || typeof portfolio.holdings !== 'object') {
    portfolio.holdings = {};
    changed = true;
  }
  if (!Array.isArray(portfolio.history)) {
    portfolio.history = [];
    changed = true;
  }
  if (!Array.isArray(portfolio.transactions)) {
    portfolio.transactions = [];
    changed = true;
  }
  if (!Array.isArray(portfolio.customAssets)) {
    portfolio.customAssets = [];
    changed = true;
  }
  if (!Array.isArray(portfolio.watchlist)) {
    portfolio.watchlist = [];
    changed = true;
  }

  const customAssetCountBefore = PRACTICE_MARKET_ASSETS.length;
  const hydratedCustomAssets = _hydratePersistedPracticeAssets(portfolio);
  if (PRACTICE_MARKET_ASSETS.length !== customAssetCountBefore || hydratedCustomAssets.length !== portfolio.customAssets.length) {
    changed = true;
  }

  const normalizedAssets = {};
  PRACTICE_MARKET_ASSETS.forEach(asset => {
    const rawAsset = portfolio.assets?.[asset.symbol];
    const baseState = _createPracticeAssetState(asset);
    const rawPrice = Number(rawAsset?.price);
    const rawPreviousClose = Number(rawAsset?.previousClose);
    const minimumPlausiblePrice = _isCryptoAsset(asset) ? Math.max(1000, asset.basePrice * 0.05) : 0.01;
    const normalizedPrice = Math.max(minimumPlausiblePrice, rawPrice > minimumPlausiblePrice ? rawPrice : asset.basePrice);
    const normalizedPreviousClose = Math.max(
      minimumPlausiblePrice,
      rawPreviousClose > minimumPlausiblePrice ? rawPreviousClose : normalizedPrice || asset.basePrice
    );
    const normalizedUpdatedOn = typeof rawAsset?.updatedOn === 'string'
      && !Number.isNaN(new Date(rawAsset.updatedOn).getTime())
      ? rawAsset.updatedOn
      : baseState.updatedOn;
    normalizedAssets[asset.symbol] = {
      ...baseState,
      ...(rawAsset && typeof rawAsset === 'object' ? rawAsset : {}),
      symbol: asset.symbol,
      price: _roundPortfolioNumber(normalizedPrice, 2),
      previousClose: _roundPortfolioNumber(normalizedPreviousClose, 2),
      dailyChange: _roundPortfolioNumber(Number(rawAsset?.dailyChange) || 0, 2),
      dailyChangePct: _roundPortfolioNumber(Number(rawAsset?.dailyChangePct) || 0, 2),
      extendedHours: _normalizeExtendedHoursQuote(rawAsset?.extendedHours),
      updatedOn: normalizedUpdatedOn
    };
    if (!rawAsset || typeof rawAsset !== 'object' || rawAsset.symbol !== asset.symbol || rawPrice !== normalizedPrice || rawPreviousClose !== normalizedPreviousClose) {
      changed = true;
    }
  });
  if (Object.keys(normalizedAssets).length !== Object.keys(portfolio.assets || {}).length) {
    changed = true;
  }
  portfolio.assets = normalizedAssets;

  const normalizedHoldings = {};
  Object.entries(portfolio.holdings || {}).forEach(([key, rawHolding]) => {
    if (!rawHolding || typeof rawHolding !== 'object') {
      changed = true;
      return;
    }
    const symbol = typeof rawHolding.symbol === 'string' && rawHolding.symbol
      ? rawHolding.symbol
      : key;
    if (!_findPracticeAsset(symbol)) {
      changed = true;
      return;
    }
    const quantity = _roundPortfolioNumber(Math.max(0, Number(rawHolding.quantity) || 0), 6);
    const totalCost = _roundPortfolioNumber(Math.max(0, Number(rawHolding.totalCost) || 0), 2);
    if (quantity <= 0 && totalCost <= 0) {
      changed = true;
      return;
    }
    normalizedHoldings[symbol] = {
      ...rawHolding,
      symbol,
      quantity,
      totalCost,
      lots: Math.max(0, Math.round(Number(rawHolding.lots) || 0)),
      lastBoughtAt: typeof rawHolding.lastBoughtAt === 'string' ? rawHolding.lastBoughtAt : null
    };
    if (key !== symbol) changed = true;
  });
  if (Object.keys(normalizedHoldings).length !== Object.keys(portfolio.holdings || {}).length) {
    changed = true;
  }
  portfolio.holdings = normalizedHoldings;

  if (!Number.isFinite(Number(portfolio.allTimeHigh))) {
    portfolio.allTimeHigh = 0;
    changed = true;
  }
  if (portfolio.allTimeHighOn && Number.isNaN(new Date(portfolio.allTimeHighOn).getTime())) {
    portfolio.allTimeHighOn = null;
    changed = true;
  }
  const normalizedHistory = portfolio.history
    .map(point => {
      const value = _roundPortfolioNumber(point?.value, 2);
      if (!Number.isFinite(value)) return null;
      const time = Number(point?.time)
        || (point?.date ? new Date(point.date).getTime() : 0)
        || (point?.recordedAt ? new Date(point.recordedAt).getTime() : 0);
      if (!Number.isFinite(time) || time <= 0) return null;
      return {
        time,
        value,
        cash: _roundPortfolioNumber(Number(point?.cash) || 0, 2),
        holdingsValue: _roundPortfolioNumber(Number(point?.holdingsValue) || 0, 2)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
    .slice(-PRACTICE_HISTORY_LIMIT);
  if (normalizedHistory.length !== portfolio.history.length || normalizedHistory.some((point, idx) => point?.time !== portfolio.history[idx]?.time)) {
    changed = true;
  }
  portfolio.history = normalizedHistory;

  const normalizedTransactions = _trimPracticePortfolioTransactions(portfolio.transactions);
  if (normalizedTransactions.length !== portfolio.transactions.length
    || normalizedTransactions.some((entry, idx) => entry?.id !== portfolio.transactions[idx]?.id)) {
    changed = true;
  }
  portfolio.transactions = normalizedTransactions;
  if (_backfillPortfolioRewardTransactions(portfolio)) changed = true;
  if (_backfillPortfolioHoldingTransactions(portfolio)) changed = true;
  portfolio.transactions = _trimPracticePortfolioTransactions(portfolio.transactions);

  const normalizedWatchlist = [...new Set((portfolio.watchlist || [])
    .map(symbol => String(symbol || '').trim().toUpperCase())
    .filter(symbol => !!_findPracticeAsset(symbol)))];
  if (normalizedWatchlist.length !== portfolio.watchlist.length || normalizedWatchlist.some((symbol, idx) => symbol !== portfolio.watchlist[idx])) {
    changed = true;
  }
  portfolio.watchlist = normalizedWatchlist;

  return { portfolio, changed };
}

function _getPracticeWatchlistSymbols(portfolio = _ensurePracticePortfolio().portfolio) {
  return [...new Set((portfolio?.watchlist || [])
    .map(symbol => String(symbol || '').trim().toUpperCase())
    .filter(symbol => !!_findPracticeAsset(symbol)))];
}

function _isPracticeAssetWatchlisted(symbol, portfolio = _ensurePracticePortfolio().portfolio) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  return _getPracticeWatchlistSymbols(portfolio).includes(upperSymbol);
}

function _applyPracticeQuoteToAssetState(portfolio, asset, quote) {
  if (!portfolio || !asset?.symbol || !quote) return false;
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) return false;
  const previousClose = Number(quote?.previousClose) > 0
    ? Number(quote.previousClose)
    : Number(portfolio.assets?.[asset.symbol]?.price) || price;
  const dailyChange = Number(quote?.change);
  const percentChange = Number(quote?.percent);
  portfolio.assets[asset.symbol] = {
    symbol: asset.symbol,
    price: _roundPortfolioNumber(price, 2),
    previousClose: _roundPortfolioNumber(previousClose, 2),
    dailyChange: Number.isFinite(dailyChange)
      ? _roundPortfolioNumber(dailyChange, 2)
      : _roundPortfolioNumber(price - previousClose, 2),
    dailyChangePct: _roundPortfolioNumber(
      Number.isFinite(percentChange)
        ? percentChange
        : (previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0),
      2
    ),
    extendedHours: _normalizeExtendedHoursQuote(quote?.extendedHours),
    updatedOn: quote?.asOf || new Date().toISOString()
  };
  return true;
}

function _setPracticeAssetWatchlistState(symbol, watched) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  if (!upperSymbol) return false;
  const asset = _findPracticeAsset(upperSymbol);
  if (!asset) return false;
  const { portfolio } = _ensurePracticePortfolio();
  const watchlist = _getPracticeWatchlistSymbols(portfolio);
  const nextWatchlist = watched
    ? [...new Set([...watchlist, upperSymbol])]
    : watchlist.filter(entry => entry !== upperSymbol);
  if (nextWatchlist.length === watchlist.length && nextWatchlist.every((entry, index) => entry === watchlist[index])) {
    return false;
  }
  portfolio.watchlist = nextWatchlist;
  save();
  return true;
}

function togglePracticeAssetWatchlist(symbol) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const currentlyWatched = _isPracticeAssetWatchlisted(upperSymbol);
  const changed = _setPracticeAssetWatchlistState(upperSymbol, !currentlyWatched);
  if (!changed) return;
  _renderActivePracticeStockDetailSheet();
  if (_isMarketScreenActive() && typeof renderMarket === 'function') renderMarket();
  if (typeof showToast === 'function') {
    showToast(currentlyWatched ? 'Removed from watchlist' : 'Added to watchlist', 'success');
  }
}

function _normalRandom() {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function _simulateAssetMove(asset) {
  const rawMove = asset.drift + asset.volatility * _normalRandom();
  const bounded = Math.max(-0.12, Math.min(0.12, rawMove));
  return bounded;
}

function _getHoldingCostBasisPrice(rawHolding, asset) {
  const quantity = Math.max(0, Number(rawHolding?.quantity) || 0);
  const totalCost = Math.max(0, Number(rawHolding?.totalCost) || 0);
  if (quantity > 0 && totalCost > 0) {
    return _roundPortfolioNumber(totalCost / quantity, 4);
  }
  return Math.max(0, Number(asset?.basePrice) || 0);
}

function _getHoldingMarkedPrice(rawHolding, marketState, asset) {
  const livePrice = Number(marketState?.price);
  if (Number.isFinite(livePrice) && livePrice > 0) {
    return livePrice;
  }
  const previousClose = Number(marketState?.previousClose);
  if (Number.isFinite(previousClose) && previousClose > 0) {
    return previousClose;
  }
  const basisPrice = _getHoldingCostBasisPrice(rawHolding, asset);
  if (basisPrice > 0) {
    return basisPrice;
  }
  return Math.max(0, Number(asset?.basePrice) || 0);
}

function _getPracticePortfolioSummary() {
  const ensured = _ensurePracticePortfolio();
  const { portfolio } = ensured;
  if (ensured.changed && typeof save === 'function') save();
  let holdingsValue = 0;
  let previousHoldingsValue = 0;
  const holdings = Object.values(portfolio.holdings || {})
    .map(rawHolding => {
      const asset = _findPracticeAsset(rawHolding.symbol);
      const quantity = Number(rawHolding.quantity) || 0;
      if (!asset || quantity <= 0) return null;
      const market = portfolio.assets?.[rawHolding.symbol] || null;
      const totalCost = Number(rawHolding.totalCost) || 0;
      const markedPrice = _getHoldingMarkedPrice(rawHolding, market, asset);
      const previousPrice = Number(market?.previousClose) > 0
        ? Number(market.previousClose)
        : markedPrice;
      const currentValue = _roundPortfolioNumber(quantity * markedPrice, 2);
      const previousValue = _roundPortfolioNumber(quantity * previousPrice, 2);
      const derivedDailyChange = _roundPortfolioNumber(currentValue - previousValue, 2);
      const derivedDailyChangePct = previousValue > 0
        ? _roundPortfolioNumber((derivedDailyChange / previousValue) * 100, 2)
        : 0;
      const gainLoss = _roundPortfolioNumber(currentValue - totalCost, 2);
      holdingsValue += currentValue;
      previousHoldingsValue += previousValue;
      return {
        symbol: rawHolding.symbol,
        name: asset.name,
        quantity,
        totalCost,
        currentValue,
        gainLoss,
        price: markedPrice,
        dailyChange: Number.isFinite(Number(market?.dailyChange))
          ? Number(market.dailyChange)
          : derivedDailyChange,
        dailyChangePct: Number.isFinite(Number(market?.dailyChangePct))
          ? Number(market.dailyChangePct)
          : derivedDailyChangePct,
        tint: asset.tint
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.currentValue - a.currentValue);

  const cashAvailable = _roundPortfolioNumber(S.cash || 0, 2);
  const portfolioValue = _roundPortfolioNumber(cashAvailable + holdingsValue, 2);
  const previousPortfolioValue = _roundPortfolioNumber(cashAvailable + previousHoldingsValue, 2);
  const todayChange = _roundPortfolioNumber(portfolioValue - previousPortfolioValue, 2);
  const todayChangePct = previousPortfolioValue > 0
    ? _roundPortfolioNumber((todayChange / previousPortfolioValue) * 100, 2)
    : 0;

  return {
    portfolio,
    holdings,
    holdingsValue: _roundPortfolioNumber(holdingsValue, 2),
    cashAvailable,
    portfolioValue,
    previousPortfolioValue,
    todayChange,
    todayChangePct
  };
}

function _syncPracticePortfolioStats(summary = _getPracticePortfolioSummary()) {
  const portfolio = summary.portfolio;
  const currentValue = _roundPortfolioNumber(summary.portfolioValue, 2);
  let changed = false;

  if (currentValue > Math.max(0, Number(portfolio.allTimeHigh) || 0) + 0.009) {
    portfolio.allTimeHigh = currentValue;
    portfolio.allTimeHighOn = new Date().toISOString();
    changed = true;
  }

  if (typeof syncDerivedProgressState === 'function') {
    syncDerivedProgressState();
  }

  return changed;
}

function _recordPracticePortfolioHistory() {
  const summary = _getPracticePortfolioSummary();
  const portfolio = summary.portfolio;
  const now = Date.now();
  const entry = {
    time: now,
    value: summary.portfolioValue,
    cash: summary.cashAvailable,
    holdingsValue: summary.holdingsValue
  };
  const last = portfolio.history[portfolio.history.length - 1];
  if (last && Math.abs((Number(last.time) || 0) - now) < 1000) {
    portfolio.history[portfolio.history.length - 1] = entry;
  } else {
    portfolio.history.push(entry);
    if (portfolio.history.length > PRACTICE_HISTORY_LIMIT) {
      portfolio.history = portfolio.history.slice(-PRACTICE_HISTORY_LIMIT);
    }
  }
  return _syncPracticePortfolioStats(summary);
}

function getPortfolioValue() {
  return _getPracticePortfolioSummary().portfolioValue;
}

function getPortfolioDailyChange(summary = _getPracticePortfolioSummary()) {
  return {
    value: summary.portfolioValue,
    previousCloseValue: summary.previousPortfolioValue,
    amount: summary.todayChange,
    percent: summary.todayChangePct
  };
}

function getTopMover(summary = _getPracticePortfolioSummary(), direction = null) {
  const holdings = Array.isArray(summary?.holdings)
    ? summary.holdings.filter(holding => (Number(holding?.quantity) || 0) > 0)
    : [];
  if (!holdings.length) return null;

  let candidates = holdings;
  if (direction === 'up') {
    candidates = holdings.filter(holding => (Number(holding.dailyChangePct) || 0) > 0);
  } else if (direction === 'down') {
    candidates = holdings.filter(holding => (Number(holding.dailyChangePct) || 0) < 0);
  }
  if (!candidates.length) candidates = holdings;

  const sorted = [...candidates].sort((a, b) => {
    if (direction === 'down') {
      return (Number(a.dailyChangePct) || 0) - (Number(b.dailyChangePct) || 0);
    }
    if (direction === 'up') {
      return (Number(b.dailyChangePct) || 0) - (Number(a.dailyChangePct) || 0);
    }
    return Math.abs(Number(b.dailyChangePct) || 0) - Math.abs(Number(a.dailyChangePct) || 0);
  });

  const mover = sorted[0];
  return mover ? {
    symbol: mover.symbol,
    name: mover.name,
    percentChange: Number(mover.dailyChangePct) || 0,
    dollarChange: Number(mover.dailyChange) || 0,
    tint: mover.tint || 'var(--green)'
  } : null;
}

function getPortfolioATH(summary = _getPracticePortfolioSummary()) {
  const value = Math.max(
    _roundPortfolioNumber(summary.portfolioValue, 2),
    _roundPortfolioNumber(summary?.portfolio?.allTimeHigh, 2)
  );
  const reachedOn = summary?.portfolio?.allTimeHighOn || null;
  return {
    value,
    reachedOn,
    isNewToday: typeof reachedOn === 'string' && reachedOn.startsWith(today())
  };
}

function _refreshPracticeMarketPrices(force = false) {
  const { portfolio } = _ensurePracticePortfolio();
  const dateKey = today();
  if (!force && portfolio.lastPriceRefreshOn === dateKey) return false;
  const nowIso = new Date().toISOString();

  PRACTICE_MARKET_ASSETS.forEach(asset => {
    const current = portfolio.assets[asset.symbol] || _createPracticeAssetState(asset);
    const previousClose = Number(current.price) || asset.basePrice;
    const move = _simulateAssetMove(asset);
    const nextPrice = _roundPortfolioNumber(Math.max(0.5, previousClose * (1 + move)), 2);
    portfolio.assets[asset.symbol] = {
      symbol: asset.symbol,
      price: nextPrice,
      previousClose,
      dailyChange: _roundPortfolioNumber(nextPrice - previousClose, 2),
      dailyChangePct: _roundPortfolioNumber(((nextPrice - previousClose) / previousClose) * 100, 2),
      updatedOn: nowIso
    };
  });

  portfolio.lastPriceRefreshOn = dateKey;
  portfolio.lastSimulatedAt = nowIso;
  _recordPracticePortfolioHistory();
  _invalidateMarketPortfolioChart();
  return true;
}

function _buildPortfolioSparkline(summary) {
  const history = (summary.portfolio.history || [])
    .map(point => ({
      time: Number(point?.time) || 0,
      value: Number(point?.value) || 0
    }))
    .filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value));
  const series = history.length >= 2
    ? history
    : [
        { time: Date.now() - 1000, value: summary.portfolioValue },
        { time: Date.now(), value: summary.portfolioValue }
      ];
  const values = series.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const minTime = series[0].time;
  const maxTime = series[series.length - 1].time;
  const timeRange = maxTime - minTime || 1;
  const width = 320;
  const height = 76;
  const points = series.map((point, idx) => {
    const x = series.length === 1
      ? width / 2
      : ((point.time - minTime) / timeRange) * width;
    const value = point.value;
    const y = height - (((value - min) / range) * (height - 14)) - 7;
    return `${_roundPortfolioNumber(x, 1)},${_roundPortfolioNumber(y, 1)}`;
  }).join(' ');
  const positive = summary.todayChange >= 0;
  return {
    width,
    height,
    points,
    stroke: positive ? '#00a844' : '#cc3333'
  };
}

function _getTimeZoneOffsetMs(timeZone, timestamp) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(timestamp)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year) || 0,
    Math.max(0, (Number(parts.month) || 1) - 1),
    Number(parts.day) || 1,
    Number(parts.hour) || 0,
    Number(parts.minute) || 0,
    Number(parts.second) || 0
  );
  return asUtc - timestamp;
}

function _getTimeZoneDayStartMs(timestamp, timeZone = 'America/New_York') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date(timestamp)).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const utcGuess = Date.UTC(
    Number(parts.year) || 0,
    Math.max(0, (Number(parts.month) || 1) - 1),
    Number(parts.day) || 1,
    0,
    0,
    0
  );
  return utcGuess - _getTimeZoneOffsetMs(timeZone, utcGuess);
}

function _getPortfolioChartRangeWindow(range, now = Date.now()) {
  const key = String(range || '1D').toUpperCase();
  const pointLimits = {
    '1D': 160,
    '1W': 180,
    '1M': 180,
    '3M': 200,
    '1Y': 240,
    MAX: 320
  };
  const durationMap = {
    '1W': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
    '3M': 90 * 24 * 60 * 60 * 1000,
    '1Y': 365 * 24 * 60 * 60 * 1000
  };
  const domainEnd = now;
  const domainStart = key === '1D'
    ? _getTimeZoneDayStartMs(now, 'America/New_York')
    : (durationMap[key] ? now - durationMap[key] : null);
  return {
    range: key,
    domainStart,
    domainEnd,
    pointLimit: pointLimits[key] || 180
  };
}

function _isMarketPortfolioChartCacheFresh(entry) {
  const fetchedAt = Number(entry?._fetchedAt) || 0;
  return !!(entry?.points?.length && fetchedAt > 0 && (Date.now() - fetchedAt) < PORTFOLIO_CHART_CACHE_TTL_MS);
}

function _getMarketPortfolioChartSeries(range = _marketPortfolioRange) {
  return _marketPortfolioChartCache[String(range || '').toUpperCase()] || null;
}

async function _getOrFetchPracticeAssetHistorySeries(symbol, range, force = false) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const normalizedRange = STOCK_CHART_TIMEFRAMES.includes(range) ? range : '1D';
  const cacheKey = _getPracticeChartCacheKey(upperSymbol, normalizedRange);
  if (!force && _isPracticeChartCacheFresh(_portfolioChartCache[cacheKey])) {
    return _portfolioChartCache[cacheKey];
  }
  const payload = await _requestPracticeStockHistory(upperSymbol, normalizedRange);
  _portfolioChartCache[cacheKey] = payload;
  return payload;
}

function _filterChartPointsToWindow(points, window) {
  const domainStart = Number(window?.domainStart) || 0;
  const domainEnd = Number(window?.domainEnd) || 0;
  return (Array.isArray(points) ? points : [])
    .filter(point => {
      const time = Number(point?.time) || 0;
      if (!time) return false;
      if (domainStart && time < domainStart) return false;
      if (domainEnd && time > domainEnd) return false;
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

function _downsamplePortfolioSeries(points, limit) {
  if (!Array.isArray(points) || points.length <= limit) return Array.isArray(points) ? points : [];
  const sampled = [];
  const step = (points.length - 1) / Math.max(1, limit - 1);
  const seen = new Set();
  for (let index = 0; index < limit; index += 1) {
    const candidate = points[Math.round(index * step)] || points[points.length - 1];
    const key = `${candidate.time}:${candidate.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sampled.push(candidate);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (sampled[0]?.time !== first.time) sampled.unshift(first);
  if (sampled[sampled.length - 1]?.time !== last.time) sampled.push(last);
  return sampled.slice(0, limit);
}

function _getSeriesValueAtTime(points, time, fallbackValue, leadingFallbackValue = null) {
  const series = Array.isArray(points) ? points : [];
  if (!series.length) return Number(fallbackValue) || 0;
  let left = 0;
  let right = series.length - 1;
  let resultIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const pointTime = Number(series[mid]?.time) || 0;
    if (pointTime <= time) {
      resultIndex = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (resultIndex >= 0) {
    return Number(series[resultIndex]?.value) || Number(fallbackValue) || 0;
  }

  if (Number.isFinite(Number(leadingFallbackValue)) && Number(leadingFallbackValue) > 0) {
    return Number(leadingFallbackValue);
  }

  return Number(series[0]?.value) || Number(fallbackValue) || 0;
}

function _getPortfolioTransactionSymbols(portfolio) {
  return [...new Set((Array.isArray(portfolio?.transactions) ? portfolio.transactions : [])
    .filter(entry => ['buy', 'sell'].includes(entry?.type) && entry?.symbol)
    .map(entry => String(entry.symbol).trim().toUpperCase())
    .filter(Boolean))];
}

function _buildStoredPortfolioHistorySeries(summary, window) {
  const filtered = _filterChartPointsToWindow(summary?.portfolio?.history || [], window);
  if (!filtered.length) return null;
  const points = _downsamplePortfolioSeries(filtered, window.pointLimit);
  const domainStart = Number(window?.domainStart) || points[0]?.time || Date.now();
  const domainEnd = Number(window?.domainEnd) || points[points.length - 1]?.time || Date.now();
  return {
    symbol: 'PORTFOLIO',
    range: window.range,
    provider: 'portfolio-history',
    asOf: new Date().toISOString(),
    domainStart,
    domainEnd,
    points: points.length >= 2
      ? points
      : [
          { time: domainStart, value: points[0].value },
          { time: domainEnd, value: points[0].value }
        ],
    _fetchedAt: Date.now()
  };
}

function _buildFlatPortfolioSeries(summary, window) {
  const value = _roundPortfolioNumber(summary?.portfolioValue || 0, 2);
  const domainEnd = Number(window?.domainEnd) || Date.now();
  const domainStart = Number(window?.domainStart) || Math.max(0, domainEnd - (60 * 60 * 1000));
  return {
    symbol: 'PORTFOLIO',
    range: window.range,
    provider: 'portfolio-flat',
    asOf: new Date().toISOString(),
    domainStart,
    domainEnd,
    points: [
      { time: domainStart, value },
      { time: domainEnd, value }
    ],
    _fetchedAt: Date.now()
  };
}

function _buildCashOnlyPortfolioSeries(summary, window) {
  const transactionsDesc = [...(summary?.portfolio?.transactions || [])]
    .map(_normalizePracticePortfolioTransaction)
    .filter(entry => entry?.type === 'cash')
    .sort((a, b) => b.time - a.time);
  if (!transactionsDesc.length) {
    return _buildFlatPortfolioSeries(summary, window);
  }

  const timestamps = [...new Set([
    Number(window?.domainStart) || 0,
    Number(window?.domainEnd) || Date.now(),
    ...transactionsDesc
      .filter(entry => {
        if (window.domainStart && entry.time < window.domainStart) return false;
        if (window.domainEnd && entry.time > window.domainEnd) return false;
        return true;
      })
      .map(entry => entry.time)
  ].filter(time => Number.isFinite(time) && time > 0))].sort((a, b) => a - b);

  const points = timestamps.map(time => {
    let cashValue = _roundPortfolioNumber(summary?.cashAvailable || 0, 2);
    transactionsDesc.forEach(entry => {
      if (entry.time <= time) return;
      cashValue = _roundPortfolioNumber(cashValue - entry.amount, 2);
    });
    return {
      time,
      value: cashValue
    };
  });

  if (points.length) {
    points[points.length - 1] = {
      ...points[points.length - 1],
      time: Number(window?.domainEnd) || points[points.length - 1].time,
      value: _roundPortfolioNumber(summary?.cashAvailable || 0, 2)
    };
  }

  return {
    symbol: 'PORTFOLIO',
    range: window.range,
    provider: 'portfolio-cash',
    asOf: new Date().toISOString(),
    domainStart: Number(window?.domainStart) || points[0]?.time || Date.now(),
    domainEnd: Number(window?.domainEnd) || points[points.length - 1]?.time || Date.now(),
    points: points.length >= 2 ? points : _buildFlatPortfolioSeries(summary, window).points,
    _fetchedAt: Date.now()
  };
}

function _buildPortfolioTimeline(summary, window, seriesBySymbol) {
  const timestamps = [];
  Object.values(seriesBySymbol || {}).forEach(series => {
    _filterChartPointsToWindow(series?.points || [], window).forEach(point => {
      timestamps.push(point.time);
    });
  });

  (summary?.portfolio?.transactions || []).forEach(entry => {
    const time = Number(entry?.time) || 0;
    if (!time) return;
    if (window.domainStart && time < window.domainStart) return;
    if (window.domainEnd && time > window.domainEnd) return;
    timestamps.push(time);
  });

  if (Number(window?.domainStart) > 0) timestamps.push(window.domainStart);
  if (Number(window?.domainEnd) > 0) timestamps.push(window.domainEnd);

  const uniqueSorted = [...new Set(timestamps.filter(time => Number.isFinite(time) && time > 0))].sort((a, b) => a - b);
  if (!uniqueSorted.length) {
    return [window.domainStart || (Date.now() - 1000), window.domainEnd || Date.now()];
  }
  return uniqueSorted;
}

function _buildPortfolioStateAtTime(summary, transactionsDesc, time) {
  const cash = _roundPortfolioNumber(summary?.cashAvailable || 0, 2);
  const positions = (summary?.holdings || []).reduce((acc, holding) => {
    const quantity = _roundPortfolioNumber(Number(holding?.quantity) || 0, 6);
    if (quantity > 0) acc[holding.symbol] = quantity;
    return acc;
  }, {});

  let rewoundCash = cash;
  (Array.isArray(transactionsDesc) ? transactionsDesc : []).forEach(entry => {
    if (entry.time <= time) return;
    if (entry.type === 'cash') {
      rewoundCash = _roundPortfolioNumber(rewoundCash - entry.amount, 2);
      return;
    }
    if (entry.type === 'buy') {
      rewoundCash = _roundPortfolioNumber(rewoundCash + entry.amount, 2);
      positions[entry.symbol] = _roundPortfolioNumber((Number(positions[entry.symbol]) || 0) - entry.quantity, 6);
      if ((Number(positions[entry.symbol]) || 0) <= 0.0000005) delete positions[entry.symbol];
      return;
    }
    if (entry.type === 'sell') {
      rewoundCash = _roundPortfolioNumber(rewoundCash - entry.amount, 2);
      positions[entry.symbol] = _roundPortfolioNumber((Number(positions[entry.symbol]) || 0) + entry.quantity, 6);
    }
  });

  return {
    cash: rewoundCash,
    positions
  };
}

function _getPortfolioTradePriceAtOrBefore(transactionsDesc, symbol, time) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  const series = Array.isArray(transactionsDesc) ? transactionsDesc : [];
  for (let index = 0; index < series.length; index += 1) {
    const entry = series[index];
    if (entry?.symbol !== upperSymbol) continue;
    if (entry.time > time) continue;
    const price = Number(entry?.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return 0;
}

function _calculatePortfolioValueAtTime(summary, stateAtTime, seriesBySymbol, time, rangeKey, transactionsDesc) {
  let holdingsValue = 0;
  Object.entries(stateAtTime?.positions || {}).forEach(([symbol, quantity]) => {
    const qty = Number(quantity) || 0;
    if (qty <= 0) return;
    const asset = _findPracticeAsset(symbol);
    const marketState = summary?.portfolio?.assets?.[symbol] || {};
    const rawHolding = summary?.portfolio?.holdings?.[symbol] || null;
    const fallbackPrice = _getPortfolioTradePriceAtOrBefore(transactionsDesc, symbol, time)
      || _getHoldingMarkedPrice(rawHolding, marketState, asset)
      || Number(asset?.basePrice)
      || 0;
    const series = seriesBySymbol?.[symbol];
    const firstSeriesTime = Number(series?.points?.[0]?.time) || 0;
    const usePreviousCloseBaseline = String(rangeKey || '').toUpperCase() === '1D'
      && !_isCryptoAsset(asset)
      && firstSeriesTime > 0
      && time < firstSeriesTime;
    const leadingFallbackPrice = usePreviousCloseBaseline
      ? (Number(marketState?.previousClose) || fallbackPrice)
      : null;
    const price = _getSeriesValueAtTime(
      series?.points || [],
      time,
      fallbackPrice,
      leadingFallbackPrice
    );
    holdingsValue += qty * price;
  });
  return _roundPortfolioNumber((Number(stateAtTime?.cash) || 0) + holdingsValue, 2);
}

function _getPortfolioChartAsOf(summary, seriesBySymbol) {
  const timestamps = [
    ...(summary?.holdings || []).map(holding => summary?.portfolio?.assets?.[holding.symbol]?.updatedOn),
    ...Object.values(seriesBySymbol || {}).map(series => series?.asOf)
  ].filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return timestamps[0]?.toISOString() || new Date().toISOString();
}

async function _buildMarketPortfolioChartSeries(range, force = false) {
  const summary = _getPracticePortfolioSummary();
  const window = _getPortfolioChartRangeWindow(range);
  const symbols = [...new Set([
    ...(summary.holdings || []).map(holding => holding.symbol),
    ..._getPortfolioTransactionSymbols(summary.portfolio)
  ])];

  if (!symbols.length) {
    // No trade history yet — flat-line at current portfolio value rather than
    // stepping through the initial cash-deposit transaction (which produced a
    // fake 45° upward curve on brand-new accounts).
    return _buildFlatPortfolioSeries(summary, window);
  }

  const seriesEntries = await Promise.allSettled(
    symbols.map(symbol => _getOrFetchPracticeAssetHistorySeries(symbol, range, force))
  );
  const seriesBySymbol = {};
  seriesEntries.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value?.points?.length) {
      seriesBySymbol[symbols[index]] = result.value;
    }
  });

  if (!Object.keys(seriesBySymbol).length) {
    return _buildStoredPortfolioHistorySeries(summary, window) || _buildFlatPortfolioSeries(summary, window);
  }

  const transactionsDesc = [...(summary.portfolio.transactions || [])]
    .map(_normalizePracticePortfolioTransaction)
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);
  const timeline = _downsamplePortfolioSeries(
    _buildPortfolioTimeline(summary, window, seriesBySymbol)
      .map(time => ({ time, value: 0 })),
    window.pointLimit
  ).map(point => point.time);

  const points = timeline.map(time => {
    const stateAtTime = _buildPortfolioStateAtTime(summary, transactionsDesc, time);
    return {
      time,
      value: _calculatePortfolioValueAtTime(summary, stateAtTime, seriesBySymbol, time, range, transactionsDesc)
    };
  }).filter(point => Number.isFinite(point.value));

  if (!points.length) {
    return _buildStoredPortfolioHistorySeries(summary, window) || _buildFlatPortfolioSeries(summary, window);
  }

  const dedupedPoints = [];
  points.forEach(point => {
    const last = dedupedPoints[dedupedPoints.length - 1];
    if (last && last.time === point.time) {
      dedupedPoints[dedupedPoints.length - 1] = point;
      return;
    }
    dedupedPoints.push(point);
  });

  const normalizedPoints = dedupedPoints.length >= 2
    ? dedupedPoints
    : _buildFlatPortfolioSeries(summary, window).points;
  if (normalizedPoints.length) {
    normalizedPoints[normalizedPoints.length - 1] = {
      ...normalizedPoints[normalizedPoints.length - 1],
      time: Number(window.domainEnd) || normalizedPoints[normalizedPoints.length - 1].time,
      value: _roundPortfolioNumber(summary.portfolioValue, 2)
    };
  }

  return {
    symbol: 'PORTFOLIO',
    range: window.range,
    provider: 'portfolio-equity',
    asOf: _getPortfolioChartAsOf(summary, seriesBySymbol),
    domainStart: Number(window.domainStart) || normalizedPoints[0]?.time || Date.now(),
    domainEnd: Number(window.domainEnd) || normalizedPoints[normalizedPoints.length - 1]?.time || Date.now(),
    points: normalizedPoints,
    debug: {
      holdings: symbols,
      transactionCount: (summary.portfolio.transactions || []).length
    },
    _fetchedAt: Date.now()
  };
}

async function refreshMarketPortfolioChart(force = false) {
  const range = PORTFOLIO_CHART_TIMEFRAMES.includes(_marketPortfolioRange) ? _marketPortfolioRange : '1D';
  if (!force && _isMarketPortfolioChartCacheFresh(_marketPortfolioChartCache[range])) {
    return _marketPortfolioChartCache[range];
  }
  if (_marketPortfolioChartPending) return _marketPortfolioChartCache[range] || null;

  const token = ++_marketPortfolioChartFetchToken;
  _marketPortfolioChartPending = true;
  _marketPortfolioChartError = '';

  try {
    const series = await _buildMarketPortfolioChartSeries(range, force);
    if (token !== _marketPortfolioChartFetchToken) return null;
    _marketPortfolioChartCache[range] = series;
    return series;
  } catch (err) {
    if (token !== _marketPortfolioChartFetchToken) return null;
    _marketPortfolioChartError = err instanceof Error ? err.message : 'Unable to load portfolio chart';
    const fallback = _buildStoredPortfolioHistorySeries(_getPracticePortfolioSummary(), _getPortfolioChartRangeWindow(range))
      || _buildFlatPortfolioSeries(_getPracticePortfolioSummary(), _getPortfolioChartRangeWindow(range));
    _marketPortfolioChartCache[range] = fallback;
    return fallback;
  } finally {
    if (token === _marketPortfolioChartFetchToken) {
      _marketPortfolioChartPending = false;
      if (_isMarketScreenActive() && typeof renderMarket === 'function') renderMarket();
    }
  }
}

function setMarketPortfolioTimeframe(range) {
  const normalized = String(range || '').toUpperCase();
  if (!PORTFOLIO_CHART_TIMEFRAMES.includes(normalized) || normalized === _marketPortfolioRange) return;
  _marketPortfolioRange = normalized;
  _marketPortfolioChartError = '';
  if (_isMarketScreenActive() && typeof renderMarket === 'function') renderMarket();
  refreshMarketPortfolioChart(false);
}

function _renderHoldingsMarkup(summary, options = {}) {
  const limit = Number(options.limit) > 0 ? Math.max(1, Number(options.limit)) : null;
  const holdings = limit ? summary.holdings.slice(0, limit) : summary.holdings;
  const emptyTitle = options.emptyTitle || 'No holdings';
  const emptyCopy = options.emptyCopy || 'Use the cash you earn from lessons, quests, and promotions to buy your first asset.';
  const interactive = options.interactive !== false;

  if (!holdings.length) {
    return `
      <div class="market-empty-state">
        <div class="market-empty-title">${emptyTitle}</div>
        <div class="market-empty-copy">${emptyCopy}</div>
      </div>`;
  }

  return `
    <div class="market-holdings-list">
      ${holdings.map(holding => `
        <button
          type="button"
          class="market-holding-row${interactive ? ' is-interactive' : ''}"
          ${interactive ? `onclick="openMarketAssetDetail('${holding.symbol}')"` : 'disabled'}
          ${interactive ? `aria-label="Open ${holding.symbol} details"` : ''}
        >
          <div class="market-holding-left">
            <div class="market-holding-dot" style="background:${holding.tint};"></div>
            <div>
              <div class="market-holding-symbol">${holding.symbol}</div>
              <div class="market-holding-meta">${_formatHoldingQuantity(holding.symbol, holding.quantity)} · Invested ${_formatUsd(holding.totalCost)}</div>
            </div>
          </div>
          <div class="market-holding-right">
            <div class="market-holding-value">${_formatUsd(holding.currentValue)}</div>
            <div class="market-holding-gain ${holding.gainLoss >= 0 ? 'up' : 'down'}">${_formatSignedUsd(holding.gainLoss)}</div>
          </div>
        </button>`).join('')}
      </div>`;
}

function _renderWatchlistMarkup(summary, options = {}) {
  const symbols = _getPracticeWatchlistSymbols(summary?.portfolio);
  const emptyTitle = options.emptyTitle || 'No watchlist';
  const emptyCopy = options.emptyCopy || 'Save assets from Search or any detail page to track them here.';
  if (!symbols.length) {
    return `
      <div class="market-empty-state market-empty-state-watchlist">
        <div class="market-empty-title">${emptyTitle}</div>
        <div class="market-empty-copy">${emptyCopy}</div>
      </div>`;
  }

  const supportingTextBySymbol = symbols.reduce((acc, symbol) => {
    const asset = _findPracticeAsset(symbol);
    if (asset) {
      acc[symbol] = `${_getAssetTypeLabel(asset)} · ${asset.category}`;
    }
    return acc;
  }, {});

  return _renderAssetListMarkup(summary, {
    symbols,
    supportingTextBySymbol
  });
}

function _renderMarketEmptyStateWithAction(title, actionLabel, action, { extraClass = '' } = {}) {
  return `
    <div class="market-empty-state market-empty-state-action${extraClass ? ` ${extraClass}` : ''}">
      <div class="market-empty-title">${_escapeMarketHtml(title)}</div>
      <button type="button" class="market-empty-action" onclick="${action}">
        <span class="market-empty-action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
          </svg>
        </span>
        <span>${_escapeMarketHtml(actionLabel)}</span>
      </button>
    </div>`;
}

function _renderMarketHoldingsSection(summary) {
  if (!summary?.holdings?.length) {
    return `
      <div class="market-list-section market-list-section-empty">
        ${_renderMarketEmptyStateWithAction(
          'No holdings',
          'Open simulator',
          "openMarketFeature('portfolio-simulator')",
          { extraClass: 'market-empty-state-holdings' }
        )}
      </div>`;
  }

  return `
    <div class="market-list-section">
      ${_renderMarketSectionHead(
        'Holdings',
        `${summary.holdings.length} live position${summary.holdings.length === 1 ? '' : 's'} in your simulator`,
        'Open simulator',
        "openMarketFeature('portfolio-simulator')"
      )}
      ${_renderHoldingsMarkup(summary, {
        limit: 4,
        emptyTitle: 'No holdings',
        emptyCopy: 'Open the simulator, make your first trade, and your holdings will live here.'
      })}
    </div>`;
}

function _renderMarketWatchlistSection(summary) {
  const watchlistSymbols = _getPracticeWatchlistSymbols(summary?.portfolio);
  if (!watchlistSymbols.length) {
    return `
      <div class="market-list-section market-list-section-empty">
        ${_renderMarketEmptyStateWithAction(
          'No watchlist',
          'Add to watchlist',
          'focusMarketSearch()',
          { extraClass: 'market-empty-state-watchlist' }
        )}
      </div>`;
  }

  return `
    <div class="market-list-section">
      ${_renderMarketSectionHead(
        'Watchlist',
        'Saved names for quick re-entry into charts and trades.'
      )}
      ${_renderWatchlistMarkup(summary)}
    </div>`;
}

function openMarketAssetDetail(symbol) {
  if (!symbol) return;
  if (_isPortfolioSimulatorOpen()) {
    openPracticeStockDetail(symbol);
    return;
  }
  if (_marketInvestOpenTimer) {
    clearTimeout(_marketInvestOpenTimer);
    _marketInvestOpenTimer = 0;
  }
  _mFeatureId = 'stock-detail';
  _openMarketModal();
  openPracticeStockDetail(symbol);
}

function _formatPortfolioQuoteTimestamp(portfolio) {
  const timestamps = Object.values(portfolio.assets || {})
    .map(asset => asset?.updatedOn)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  if (!timestamps.length) return '';
  return timestamps[0].toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function _isPortfolioSimulatorOpen() {
  return _mFeatureId === 'portfolio-simulator'
    && document.getElementById('marketModal')?.classList.contains('open');
}

function _isStandaloneStockDetailOpen() {
  return _mFeatureId === 'stock-detail'
    && document.getElementById('marketModal')?.classList.contains('open');
}

function _renderActivePracticeStockDetailSheet() {
  if (_isPortfolioSimulatorOpen()) {
    _renderPortfolioSimulatorModal();
    return;
  }
  if (_isStandaloneStockDetailOpen()) {
    _renderStandaloneStockDetailModal();
  }
}

function _buildPortfolioStatusCopy(summary) {
  if (_portfolioQuoteStatus) return _portfolioQuoteStatus;
  const updatedAt = _formatPortfolioQuoteTimestamp(summary.portfolio);
  if (_portfolioQuoteMode === 'live' && updatedAt) {
    return `Live quotes updated at ${updatedAt} and refresh every 45 seconds`;
  }
  if (_portfolioQuoteMode === 'simulated' && summary.portfolio.lastSimulatedAt) {
    return 'Live quotes unavailable - showing the last stored prices';
  }
  return 'Live quotes will appear here when the simulator opens.';
}

function _getMarketRewardPrompt() {
  const prompt = S.rewardsSummary?.marketRewardPrompt;
  if (!prompt || typeof prompt !== 'object') return null;
  const amount = Math.max(0, Number(prompt.amount) || 0);
  if (amount <= 0) return null;
  return {
    ...prompt,
    amount
  };
}

function clearMarketRewardPrompt({ rerender = true, persist = true } = {}) {
  if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') return;
  if (!S.rewardsSummary.marketRewardPrompt) return;
  S.rewardsSummary.marketRewardPrompt = null;
  if (persist && typeof save === 'function') save();
  if (rerender && typeof renderMarket === 'function') renderMarket();
}

function _getSuggestedInvestmentSymbol(summary = _getPracticePortfolioSummary()) {
  const direction = summary.todayChange >= 0 ? 'up' : 'down';
  const mover = getTopMover(summary, direction);
  if (mover?.symbol) return mover.symbol;
  if (summary.holdings?.[0]?.symbol) return summary.holdings[0].symbol;
  return PRACTICE_MARKET_ASSETS[0]?.symbol || 'AAPL';
}

function openMarketInvestFlow(symbol = null) {
  const summary = _getPracticePortfolioSummary();
  const target = symbol || _getSuggestedInvestmentSymbol(summary);
  clearMarketRewardPrompt({ rerender: false, persist: true });
  openMarketAssetDetail(target);
}

function _buildMarketSignalCardIcon(type) {
  if (type === 'ath') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
      <path d="M8 21h8M12 17v4M7 4H4a2 2 0 0 0-2 2v1c0 4.4 2.9 8.2 7 9.5M17 4h3a2 2 0 0 1 2 2v1c0 4.4-2.9 8.2-7 9.5M5 4h14"/>
    </svg>`;
  }
  if (type === 'cash') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
      <path d="M12 1v22"/><path d="M17 5.5a4.5 4.5 0 0 0-4.5-3.5h-1A4.5 4.5 0 0 0 7 6.5c0 2.49 2.01 4.5 4.5 4.5h1A4.5 4.5 0 0 1 17 15.5 4.5 4.5 0 0 1 12.5 20h-1A4.5 4.5 0 0 1 7 16.5"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
    <polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>
  </svg>`;
}

function _getMarketApiUrlCandidates(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidates = [];
  const addCandidate = candidate => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };
  const origin = typeof window !== 'undefined'
    && window.location
    && typeof window.location.origin === 'string'
    && window.location.origin !== 'null'
      ? window.location.origin
      : '';

  if (origin) {
    addCandidate(`${origin}${normalizedPath}`);
  } else {
    addCandidate(normalizedPath);
  }

  addCandidate(`http://127.0.0.1:8000${normalizedPath}`);
  addCandidate(`http://localhost:8000${normalizedPath}`);

  return candidates;
}

async function _fetchMarketJson(path, {
  notFoundMessage,
  invalidPayloadMessage
} = {}) {
  const candidates = _getMarketApiUrlCandidates(path);
  let lastMessage = 'Market request failed';

  for (let index = 0; index < candidates.length; index++) {
    const url = candidates[index];
    let res = null;
    let payload = null;

    try {
      res = await fetch(url, {
        method: 'GET',
        cache: 'no-store'
      });
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : 'Network error';
      if (index < candidates.length - 1) continue;
      throw new Error(lastMessage);
    }

    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (res.ok) {
      if (!payload || typeof payload !== 'object') {
        lastMessage = invalidPayloadMessage || 'Market payload missing';
        if (index < candidates.length - 1) continue;
        throw new Error(lastMessage);
      }
      return payload;
    }

    lastMessage = res.status === 404
      ? (notFoundMessage || `Market API route not found (${path})`)
      : payload?.error || `Market request failed (${res.status})`;

    if ([404, 500, 502, 503].includes(res.status) && index < candidates.length - 1) {
      continue;
    }
    throw new Error(lastMessage);
  }

  throw new Error(lastMessage);
}

async function _requestPracticeAssetProfile(symbol) {
  const upperSymbol = String(symbol || '').trim().toUpperCase();
  if (!upperSymbol) throw new Error('Missing symbol');
  const payload = await _fetchMarketJson(`/api/asset-profile?symbol=${encodeURIComponent(upperSymbol)}`, {
    notFoundMessage: 'Asset profile route not found. Serve the app with python3 server.py so /api/asset-profile is available.',
    invalidPayloadMessage: 'Asset profile payload missing'
  });
  return payload;
}

function _getAssetOverviewProfile(asset) {
  if (!asset) return null;
  if (_isCryptoAsset(asset)) {
    return _buildCryptoAssetOverviewProfile(asset);
  }
  const cached = _getMarketAssetProfile(asset.symbol);
  return cached && typeof cached === 'object' ? cached : null;
}

async function refreshPracticeAssetProfile(symbol, force = false) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return null;
  if (_isCryptoAsset(asset)) {
    const profile = _storeMarketAssetProfile(asset, _buildCryptoAssetOverviewProfile(asset));
    _portfolioDetailProfileError = '';
    _portfolioDetailProfilePending = false;
    return profile;
  }

  const cached = _getMarketAssetProfile(asset.symbol);
  if (!force && cached && _isMarketAssetProfileFresh(cached)) {
    _applyProfileToPracticeAsset(asset, cached);
    return cached;
  }
  if (_portfolioDetailProfilePending && _portfolioDetailSymbol === asset.symbol) {
    return cached || null;
  }

  _portfolioDetailProfilePending = true;
  _portfolioDetailProfileError = '';
  _renderActivePracticeStockDetailSheet();

  try {
    const payload = await _requestPracticeAssetProfile(asset.symbol);
    const profile = _storeMarketAssetProfile(asset, payload);
    _applyProfileToPracticeAsset(asset, profile);
    _portfolioDetailProfileError = '';
    if (_portfolioDetailSymbol === asset.symbol) _renderActivePracticeStockDetailSheet();
    return profile;
  } catch (err) {
    _portfolioDetailProfileError = err instanceof Error ? err.message : 'Unable to load company overview';
    if (_portfolioDetailSymbol === asset.symbol) _renderActivePracticeStockDetailSheet();
    return cached || null;
  } finally {
    _portfolioDetailProfilePending = false;
    if (_portfolioDetailSymbol === asset.symbol) _renderActivePracticeStockDetailSheet();
  }
}

function _buildMarketSignalCards(summary = _getPracticePortfolioSummary()) {
  const cards = [];
  const ath = getPortfolioATH(summary);
  const rewardPrompt = _getMarketRewardPrompt();
  const daily = getPortfolioDailyChange(summary);

  if (rewardPrompt) {
    cards.push({
      tone: 'cash',
      type: 'cash',
      headline: `You earned ${_formatUsd(rewardPrompt.amount)} from learning`,
      body: 'That cash is ready to put to work in your practice portfolio.',
      actionLabel: `Invest Cash ${FinLingoIcons.right()}`,
      action: `openMarketInvestFlow()`
    });
  }

  if (ath.value > 0 && ath.isNewToday) {
    cards.push({
      tone: 'gain',
      type: 'ath',
      headline: 'New Portfolio High',
      body: `Your portfolio reached a new high of ${_formatUsd(ath.value)}.`
    });
  }

  if (Math.abs(daily.amount) >= 0.01 && summary.holdings.length) {
    const direction = daily.amount >= 0 ? 'up' : 'down';
    const mover = getTopMover(summary, direction);
    const moverText = mover
      ? `${daily.amount >= 0 ? 'Top mover' : 'Largest move today'}: ${mover.symbol} ${_formatSignedPct(mover.percentChange)}`
      : '';
    cards.push({
      tone: daily.amount >= 0 ? 'gain' : 'loss',
      type: 'move',
      headline: daily.amount >= 0 ? 'Portfolio Up Today' : 'Portfolio Down Today',
      body: `${daily.amount >= 0 ? 'Your portfolio gained' : 'Your portfolio is down'} ${_formatUsd(Math.abs(daily.amount))} today.${moverText ? ` ${moverText}` : ''}`
    });
  }

  return cards.slice(0, MARKET_SIGNAL_CARD_LIMIT);
}

function _getMarketMoverReferencePrice(asset, summary = _getPracticePortfolioSummary()) {
  const livePrice = Number(summary?.portfolio?.assets?.[asset?.symbol]?.price);
  if (Number.isFinite(livePrice) && livePrice > 0) return livePrice;
  return Math.max(0, Number(asset?.basePrice) || 0);
}

function _getMarketMoverReferenceMarketCap(asset) {
  if (!asset?.symbol) return null;
  const cachedProfileCap = Number(_getMarketAssetProfile(asset.symbol)?.marketCap);
  if (Number.isFinite(cachedProfileCap) && cachedProfileCap > 0) return cachedProfileCap;
  const fallbackCap = Number(MARKET_MOVER_MARKET_CAP_FALLBACKS[asset.symbol]);
  if (Number.isFinite(fallbackCap) && fallbackCap > 0) return fallbackCap;
  return null;
}

function _isStrictMarketMoverCandidate(asset, price, marketCap) {
  if (!asset || !Number.isFinite(price) || price < MARKET_TOP_MOVER_MIN_PRICE) return false;
  if (_isCryptoAsset(asset) || asset.assetType === 'etf') return true;
  return Number.isFinite(marketCap) && marketCap >= MARKET_TOP_MOVER_MIN_MARKET_CAP;
}

function _hasMarketMoverQuoteData(summary = _getPracticePortfolioSummary()) {
  const portfolio = summary?.portfolio;
  if (!portfolio || typeof portfolio !== 'object') return false;
  if (portfolio.lastPriceRefreshOn === today()) return true;

  return PRACTICE_MARKET_ASSETS.some(asset => {
    const market = portfolio.assets?.[asset.symbol];
    const updatedAt = new Date(market?.updatedOn || '').getTime();
    return Number.isFinite(updatedAt)
      && updatedAt > 0
      && Math.abs(Number(market?.dailyChangePct) || 0) >= 0.01;
  });
}

function _ensureMarketQuoteHydration(summary = _getPracticePortfolioSummary()) {
  if (_portfolioFetchPending) return false;
  if (_hasMarketMoverQuoteData(summary)) return false;
  refreshPracticePortfolioQuotes(false);
  return true;
}

function _getMarketSearchMovers(summary = _getPracticePortfolioSummary()) {
  const candidates = PRACTICE_MARKET_ASSETS
    .filter(asset => CORE_PRACTICE_ASSET_SYMBOLS.has(asset.symbol))
    .map(asset => {
      const market = summary?.portfolio?.assets?.[asset.symbol] || _createPracticeAssetState(asset);
      const price = _getMarketMoverReferencePrice(asset, summary);
      const marketCap = _getMarketMoverReferenceMarketCap(asset);
      return {
        asset,
        percentChange: Number(market.dailyChangePct) || 0,
        price,
        marketCap,
        strictEligible: _isStrictMarketMoverCandidate(asset, price, marketCap)
      };
    })
    .filter(entry => Number.isFinite(entry.price) && entry.price >= MARKET_TOP_MOVER_MIN_PRICE)
    .sort((a, b) => {
      if (a.strictEligible !== b.strictEligible) return a.strictEligible ? -1 : 1;
      const diff = Math.abs(b.percentChange) - Math.abs(a.percentChange);
      if (Math.abs(diff) > 0.001) return diff;
      const capDiff = (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0);
      if (Math.abs(capDiff) > 1000000) return capDiff;
      return String(a.asset.symbol).localeCompare(String(b.asset.symbol));
    });

  return candidates.slice(0, MARKET_SEARCH_MOVER_LIMIT);
}

function _renderMarketSearchMoverMarkup(summary) {
  if (!_hasMarketMoverQuoteData(summary)) {
    return `
      <div class="market-search-empty">
        <div class="market-empty-title">${_portfolioFetchPending ? 'Loading Top Movers' : 'Top Movers unavailable'}</div>
        <div class="market-empty-copy">${_portfolioFetchPending ? 'Pulling live market moves now.' : 'Live quote data has not loaded yet. Tap back into search in a moment.'}</div>
      </div>`;
  }

  const movers = _getMarketSearchMovers(summary);
  if (!movers.length) return '';

  return `
    <div class="market-search-movers">
      <div class="market-search-movers-wrap">
        ${movers.map(({ asset, percentChange }) => {
          const tone = _getDirectionalTone(percentChange);
          return `
            <button type="button" class="market-mover-pill ${tone}" onclick="openMarketMover('${asset.symbol}')">
              <span class="market-mover-pill-symbol">${asset.symbol}</span>
              <span class="market-mover-pill-change ${tone}">${_formatUnsignedPct(percentChange, 1)}</span>
            </button>`;
        }).join('')}
      </div>
    </div>`;
}

function _getMarketSearchPresentation(summary, query) {
  const trimmedQuery = String(query || '').trim();
  const results = trimmedQuery ? _buildMarketSearchResults(trimmedQuery) : [];
  const showMovers = !trimmedQuery && _marketSearchFocused;
  const moversReady = _hasMarketMoverQuoteData(summary);
  const title = trimmedQuery
    ? 'Search results'
    : showMovers
    ? 'Top Movers'
    : 'Search the market';
  const sub = trimmedQuery
    ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} across the supported Market universe.`
    : showMovers
    ? moversReady
      ? 'Tap a mover or start typing.'
      : _portfolioFetchPending
        ? 'Loading live market moves.'
        : 'Pulling the latest movers now.'
    : 'Type a ticker or company name.';
  const markup = trimmedQuery
    ? (
      results.length
        ? _renderMarketSearchResultsMarkup(summary, results)
        : `
          <div class="market-search-empty">
            <div class="market-empty-title">No results available</div>
            <div class="market-empty-copy">Try a ticker like AAPL or VOO, or search by a company name like Apple or Microsoft.</div>
          </div>`
    )
    : showMovers
    ? _renderMarketSearchMoverMarkup(summary)
    : '';

  return {
    title,
    sub,
    markup,
    hasQuery: !!trimmedQuery
  };
}

function _syncMarketSearchUi() {
  const summary = _getPracticePortfolioSummary();
  const presentation = _getMarketSearchPresentation(summary, _marketSearchQuery);
  document.querySelectorAll('[data-market-search-shell="true"]').forEach(shell => {
    const input = shell.querySelector('.market-search-input');
    if (input && input.value !== _marketSearchQuery) {
      input.value = _marketSearchQuery;
    }
    const clearBtn = shell.querySelector('.market-search-clear');
    if (clearBtn) clearBtn.classList.toggle('is-hidden', !presentation.hasQuery);
    const titleEl = shell.querySelector('[data-market-search-title]');
    if (titleEl) titleEl.textContent = presentation.title;
    const subEl = shell.querySelector('[data-market-search-sub]');
    if (subEl) subEl.textContent = presentation.sub;
    const resultsEl = shell.querySelector('[data-market-search-results]');
    if (resultsEl) resultsEl.innerHTML = presentation.markup;
  });
}

function _renderMarketSearchSlotMarkup() {
  const summary = _getPracticePortfolioSummary();
  const query = String(_marketSearchQuery || '');
  const presentation = _getMarketSearchPresentation(summary, query);

  return `
    <div class="market-discover-shell">
      <div class="market-search-shell" data-market-search-shell="true">
        <div class="market-search-input-shell">
          <div class="market-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="11" cy="11" r="6.5"></circle>
              <path d="M16 16l5 5"></path>
            </svg>
          </div>
          <input
            class="market-search-input"
            type="search"
            inputmode="search"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Search tickers or companies"
            value="${_escapeMarketHtml(query)}"
            onfocus="setMarketSearchFocused(true)"
            onblur="handleMarketSearchBlur(event)"
            oninput="setMarketSearchQuery(this.value)"
          />
          <button type="button" class="market-search-clear${presentation.hasQuery ? '' : ' is-hidden'}" onclick="clearMarketSearchQuery()" aria-label="Clear search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="market-search-copy">
          <div class="market-search-title" data-market-search-title>${presentation.title}</div>
          <div class="market-search-sub" data-market-search-sub>${presentation.sub}</div>
        </div>
        <div class="market-search-results" data-market-search-results>${presentation.markup}</div>
      </div>
    </div>`;
}

function _renderMarketSectionHead(title, sub, actionLabel = '', action = '') {
  return `
    <div class="market-section-head">
      <div>
        <div class="market-panel-title">${title}</div>
        ${sub ? `<div class="market-panel-copy">${sub}</div>` : ''}
      </div>
      ${actionLabel ? `<button class="market-section-action" onclick="${action}">${actionLabel}</button>` : ''}
    </div>`;
}

function _renderMarketBlueChipPicksMarkup(summary, { limit = MARKET_BLUE_CHIP_PICKS.length } = {}) {
  const notesBySymbol = MARKET_BLUE_CHIP_PICKS.slice(0, limit).reduce((acc, pick) => {
    acc[pick.symbol] = `${pick.title} · ${pick.note}`;
    return acc;
  }, {});
  return _renderAssetListMarkup(summary, {
    symbols: MARKET_BLUE_CHIP_PICKS.slice(0, limit).map(pick => pick.symbol),
    supportingTextBySymbol: notesBySymbol
  });
}

function _renderMarketAssetRow(asset, summary, {
  supportingText = '',
  supportingClass = '',
  onclick = '',
  extraClass = '',
  quoteOverrideText = '',
  changeOverrideText = '',
  disabled = false
} = {}) {
  const market = summary.portfolio.assets[asset.symbol] || _createPracticeAssetState(asset);
  const holding = _getPracticeHoldingSnapshot(summary, asset.symbol);
  const hasOverride = !!(quoteOverrideText || changeOverrideText);
  const changeClass = hasOverride
    ? 'muted'
    : (Number(market.dailyChangePct) || 0) >= 0 ? 'up' : 'down';
  const resolvedSupportingText = supportingText
    || (holding ? `${_formatHoldingQuantity(asset.symbol, holding.quantity)} owned` : asset.category);
  const resolvedSupportingClass = supportingText
    ? supportingClass
    : (holding ? '' : 'muted');
  const action = onclick || `openMarketAssetDetail('${asset.symbol}')`;

  return `
    <button type="button" class="market-stock-row${extraClass ? ` ${extraClass}` : ''}" onclick="${action}" ${disabled ? 'disabled' : ''}>
      <div class="market-stock-left">
        <div class="market-stock-symbol-wrap">
          <div class="market-stock-symbol">${asset.symbol}</div>
          <div class="market-stock-name">${asset.name}</div>
        </div>
        <div class="market-stock-meta-row">
          <div class="market-stock-owned ${resolvedSupportingClass}">
            ${resolvedSupportingText}
          </div>
          ${_renderAssetMarketStatusBadge(asset, { compact: true })}
        </div>
      </div>
      <div class="market-stock-right">
        <div class="market-stock-price">${quoteOverrideText || _formatUsd(market.price, 2)}</div>
        <div class="market-stock-change ${changeClass}">
          ${changeOverrideText || _formatSignedPct(market.dailyChangePct)}
        </div>
      </div>
      <div class="market-stock-chevron" aria-hidden="true">
        ${FinLingoIcons.right()}
      </div>
    </button>`;
}

function _renderMarketSearchResultsMarkup(summary, results) {
  return `
    <div class="market-search-results">
      <div class="market-stock-bank market-stock-bank-search">
        ${results.map(result => {
          const asset = result.asset;
          const isPending = result.kind === 'exact' && result.symbol === _marketSearchPendingSymbol;
          const typeLabel = result.kind === 'exact'
            ? isPending
              ? 'Checking live data'
              : 'Exact ticker search'
            : `${_getAssetTypeLabel(asset)} · ${asset.category}`;
          return _renderMarketAssetRow(asset, summary, {
            supportingText: typeLabel,
            supportingClass: 'muted',
            onclick: `openMarketSearchResult('${asset.symbol}')`,
            extraClass: result.kind === 'exact'
              ? `market-stock-row-search-exact${isPending ? ' is-pending' : ''}`
              : 'market-stock-row-search',
            quoteOverrideText: result.kind === 'exact' ? (isPending ? 'Checking' : 'Search') : '',
            changeOverrideText: result.kind === 'exact' ? (isPending ? 'Live Data' : 'Ticker') : '',
            disabled: isPending
          });
        }).join('')}
      </div>
    </div>`;
}

function _getMarketPortfolioRangeCopy(range) {
  switch (String(range || '').toUpperCase()) {
    case '1D':
      return 'Current Eastern calendar day for your full portfolio.';
    case '1W':
      return 'Past 7 days of portfolio movement.';
    case '1M':
      return 'Past month of portfolio movement.';
    case '3M':
      return 'Past 3 months of portfolio movement.';
    case '1Y':
      return 'Past year of portfolio movement.';
    case 'MAX':
      return 'All available portfolio history.';
    default:
      return 'Portfolio movement over the selected range.';
  }
}

function _getMarketPortfolioChartStatus(series) {
  const selectedRangeLabel = _getStockChartRangeLabel(_marketPortfolioRange);
  if (_marketPortfolioChartPending) {
    return `Refreshing ${selectedRangeLabel} equity curve…`;
  }
  if (_formatChartUpdateTime(series?.asOf)) {
    return `Updated ${_formatChartUpdateTime(series.asOf)}`;
  }
  if (_marketPortfolioChartError) {
    return 'Showing the latest available account history';
  }
  return `${selectedRangeLabel} equity curve`;
}

function renderMarketPortfolioOverviewMarkup() {
  const summary = _getPracticePortfolioSummary();
  const statsChanged = _syncPracticePortfolioStats(summary);
  const ath = getPortfolioATH(summary);
  const rangeWindow = _getPortfolioChartRangeWindow(_marketPortfolioRange);
  let chartSeries = _getMarketPortfolioChartSeries(_marketPortfolioRange);
  if (!chartSeries) {
    chartSeries = _buildStoredPortfolioHistorySeries(summary, rangeWindow) || _buildFlatPortfolioSeries(summary, rangeWindow);
  }
  if (!_isMarketPortfolioChartCacheFresh(_getMarketPortfolioChartSeries(_marketPortfolioRange))) {
    refreshMarketPortfolioChart(false);
  }
  const chart = _buildPracticeStockChartGraphic(chartSeries);
  const chartRangeLabel = _getStockChartRangeLabel(_marketPortfolioRange);
  const baseline = Number(chart?.firstValue);
  const displayChange = Number.isFinite(baseline) && baseline > 0
    ? _roundPortfolioNumber(summary.portfolioValue - baseline, 2)
    : summary.todayChange;
  const displayChangePct = Number.isFinite(baseline) && baseline > 0
    ? _roundPortfolioNumber((displayChange / baseline) * 100, 2)
    : summary.todayChangePct;
  const moveDisplay = _buildPortfolioMoveDisplay(displayChange, displayChangePct, 2);
  const chartStatus = _getMarketPortfolioChartStatus(chartSeries);
  _setMarketPortfolioChartScrubModel({
    range: _marketPortfolioRange,
    chart,
    valueText: _formatUsd(summary.portfolioValue, 2),
    changeText: moveDisplay.text,
    changeTone: moveDisplay.tone,
    statusText: chartStatus
  });
  if (statsChanged && typeof save === 'function') save();

  return `
    <div class="market-page-stack market-home-stack">
      ${_renderMarketSearchSlotMarkup()}
      <div class="market-portfolio-hero market-portfolio-hero-premium">
        <div class="market-section-label">Practice Portfolio</div>
        <div id="marketPortfolioChartValue" class="market-portfolio-hero-value">${_formatUsd(summary.portfolioValue, 2)}</div>
        <div id="marketPortfolioChartChange" class="market-portfolio-hero-change ${moveDisplay.tone}">
          ${moveDisplay.text}
        </div>
        <div class="market-chart-card market-chart-card-home">
          <div class="market-chart-label">${chartRangeLabel} portfolio curve</div>
          <div id="marketPortfolioChartStatus" class="market-portfolio-chart-status">${chartStatus}</div>
          <div
            id="marketPortfolioChartStage"
            class="market-portfolio-chart-stage ${chart ? 'is-interactive' : ''}"
            ${chart ? `
              onpointerdown="startMarketPortfolioChartScrub(event)"
              onpointermove="moveMarketPortfolioChartScrub(event)"
              onpointerup="endMarketPortfolioChartScrub(event)"
              onpointercancel="endMarketPortfolioChartScrub(event)"
              onlostpointercapture="endMarketPortfolioChartScrub(event)"
            ` : ''}
          >
            ${chart ? `
              <svg viewBox="0 0 ${chart.width} ${chart.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="market-portfolio-chart-svg">
                <defs>
                  <linearGradient id="marketPortfolioGradient-${_marketPortfolioRange}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="${chart.fillStart}"></stop>
                    <stop offset="100%" stop-color="${chart.fillEnd}"></stop>
                  </linearGradient>
                </defs>
                ${chart.guideLines.map(y => `
                  <line x1="0" y1="${y}" x2="${chart.width}" y2="${y}" class="market-portfolio-chart-guide"></line>
                `).join('')}
                <path d="${chart.areaPath}" fill="url(#marketPortfolioGradient-${_marketPortfolioRange})"></path>
                <polyline points="${chart.polyline}" fill="none" stroke="${chart.stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
                <line id="marketPortfolioChartScrubLine" class="market-stock-chart-scrub-line" x1="${chart.lastPoint.x}" x2="${chart.lastPoint.x}" y1="0" y2="${chart.height}"></line>
                <circle id="marketPortfolioChartCurrentHalo" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="3.2" fill="${chart.stroke}" fill-opacity="0.14"></circle>
                <circle id="marketPortfolioChartCurrentDot" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="1.8" fill="${chart.stroke}"></circle>
                <circle id="marketPortfolioChartScrubHalo" class="market-stock-chart-scrub-halo" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="6"></circle>
                <circle id="marketPortfolioChartScrubDot" class="market-stock-chart-scrub-dot" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="2.3"></circle>
              </svg>
            ` : `
              <div class="market-portfolio-chart-empty">Loading portfolio history…</div>
            `}
          </div>
          <div class="market-timeframe-row-wrap market-timeframe-row-wrap-portfolio">
            <div class="market-timeframe-row" role="tablist" aria-label="Portfolio chart range selector">
              ${PORTFOLIO_CHART_TIMEFRAMES.map(range => `
                <button
                  type="button"
                  class="market-timeframe-btn ${range === _marketPortfolioRange ? 'active' : ''}"
                  onclick="setMarketPortfolioTimeframe('${range}')"
                  role="tab"
                  aria-selected="${range === _marketPortfolioRange ? 'true' : 'false'}">
                  ${range}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="market-portfolio-chart-copy">${_getMarketPortfolioRangeCopy(_marketPortfolioRange)}</div>
          ${_marketPortfolioChartError && !_marketPortfolioChartPending ? `
            <div class="market-portfolio-chart-error">${_escapeMarketHtml(_marketPortfolioChartError)}</div>
          ` : ''}
        </div>
        <div class="market-portfolio-inline-stats">
          <div class="market-inline-stat">
            <span>Purchasing Power</span>
            <strong>${_formatUsd(summary.cashAvailable)}</strong>
          </div>
          <div class="market-inline-stat">
            <span>Holdings value</span>
            <strong>${_formatUsd(summary.holdingsValue)}</strong>
          </div>
          <div class="market-inline-stat">
            <span>All-time high</span>
            <strong>${_formatUsd(ath.value)}</strong>
          </div>
        </div>
      </div>
      ${_renderMarketHoldingsSection(summary)}
      ${_renderMarketWatchlistSection(summary)}
      <div class="market-list-section">
        ${_renderMarketSectionHead(
          'Blue Chip Picks',
          'Starter ideas designed to sit naturally alongside future search.',
          'View all assets',
          "openMarketFeature('portfolio-simulator')"
        )}
        ${_renderMarketBlueChipPicksMarkup(summary)}
      </div>
      <div class="market-list-section">
        ${_renderMarketSectionHead(
          'Explore Assets',
          'Open any chart, save names to your watchlist, and jump straight into a trade from the detail view.'
        )}
        ${_renderAssetListMarkup(summary)}
      </div>
    </div>`;
}

function renderMarketSignalCardsMarkup() {
  const summary = _getPracticePortfolioSummary();
  const cards = _buildMarketSignalCards(summary);
  if (!cards.length) return '';

  return `
    <div class="market-page-stack">
      <div class="market-section-label">Today</div>
      <div class="market-signal-stack">
        ${cards.map(card => `
          <div class="market-signal-card market-signal-card-${card.tone}">
            <div class="market-signal-icon">${_buildMarketSignalCardIcon(card.type)}</div>
            <div class="market-signal-copy">
              <div class="market-signal-title">${card.headline}</div>
              <div class="market-signal-body">${card.body}</div>
            </div>
            ${card.actionLabel ? `
              <button class="market-signal-btn" onclick="${card.action}">${card.actionLabel}</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
}

function _escapeMarketHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _trimMarketHistory(list, limit = 14) {
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

function _getMarketDailySeed(dateKey = today()) {
  if (typeof getDailyQuestionSeed === 'function') {
    return getDailyQuestionSeed(dateKey) + 41;
  }
  let hash = 0;
  String(dateKey || today()).split('').forEach(char => {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  });
  return Math.abs(hash);
}

function _seededMarketShuffle(list, seed) {
  const copy = Array.isArray(list) ? [...list] : [];
  let value = Math.max(1, Number(seed) || 1);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    value = (value * 9301 + 49297) % 233280;
    const swapIndex = Math.floor((value / 233280) * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function _ensureMarketDailyLoopState() {
  if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') {
    S.rewardsSummary = typeof getDefaultRewardsSummary === 'function'
      ? getDefaultRewardsSummary()
      : {};
  }
  if (!S.rewardsSummary.dailyLoop || typeof S.rewardsSummary.dailyLoop !== 'object') {
    S.rewardsSummary.dailyLoop = typeof getDefaultDailyLoopState === 'function'
      ? getDefaultDailyLoopState()
      : {};
  }
  if (!S.rewardsSummary.dailyLoop.chartGuess || typeof S.rewardsSummary.dailyLoop.chartGuess !== 'object') {
    S.rewardsSummary.dailyLoop.chartGuess = typeof getDefaultDailyLoopState === 'function'
      ? getDefaultDailyLoopState().chartGuess
      : {
          enabled: true,
          lastOpenedOn: null,
          active: null,
          history: []
        };
  }

  const chartGuess = S.rewardsSummary.dailyLoop.chartGuess;
  chartGuess.enabled = chartGuess.enabled !== false;
  chartGuess.history = _trimMarketHistory(chartGuess.history || []);
  chartGuess.active = chartGuess.active && typeof chartGuess.active === 'object'
    ? chartGuess.active
    : null;
  return chartGuess;
}

function _getMarketChartGuessAssetPool() {
  return PRACTICE_MARKET_ASSETS.filter(asset => MARKET_CHART_GUESS_SYMBOLS.includes(asset.symbol));
}

function _createMarketChartGuessRecord(dateKey = today()) {
  const assets = _getMarketChartGuessAssetPool();
  if (!assets.length) return null;
  const seed = _getMarketDailySeed(dateKey);
  const target = assets[seed % assets.length];
  return {
    date: dateKey,
    promptId: `market-chart:${dateKey}:${target.symbol}`,
    variant: MARKET_CHART_CHALLENGE_VARIANT,
    symbol: target.symbol,
    choiceKeys: _seededMarketShuffle(Object.keys(MARKET_CHART_CHOICE_LIBRARY), seed + 67),
    range: MARKET_DAILY_CHART_RANGE,
    status: 'unanswered',
    submittedChoice: null,
    submittedAt: null,
    revealedAt: null,
    correctChoice: null,
    explanation: '',
    reward: null,
    rewardId: null
  };
}

function _archiveMarketChartGuessRecord(record) {
  if (!record?.promptId) return;
  const chartGuess = _ensureMarketDailyLoopState();
  const existing = (chartGuess.history || []).filter(entry => entry?.promptId !== record.promptId);
  chartGuess.history = _trimMarketHistory([{ ...record }, ...existing]);
}

function _ensureMarketChartGuessRecord() {
  const chartGuess = _ensureMarketDailyLoopState();
  const dateKey = today();
  if (!chartGuess.active) {
    chartGuess.active = _createMarketChartGuessRecord(dateKey);
    return chartGuess.active;
  }
  if (chartGuess.active.date !== dateKey || chartGuess.active.variant !== MARKET_CHART_CHALLENGE_VARIANT) {
    _archiveMarketChartGuessRecord(chartGuess.active);
    chartGuess.active = _createMarketChartGuessRecord(dateKey);
  } else if (!Array.isArray(chartGuess.active.choiceKeys) || !chartGuess.active.choiceKeys.length) {
    const seed = _getMarketDailySeed(chartGuess.active.date || dateKey);
    chartGuess.active.choiceKeys = _seededMarketShuffle(Object.keys(MARKET_CHART_CHOICE_LIBRARY), seed + 67);
  }
  return chartGuess.active;
}

function _getMarketChartGuessCacheKey(record = _ensureMarketChartGuessRecord()) {
  return record ? `${record.symbol}:${record.range}` : '';
}

function _isMarketChartGuessCacheFresh(entry) {
  const fetchedAt = Number(entry?._fetchedAt) || 0;
  return !!(entry?.points?.length && fetchedAt > 0 && (Date.now() - fetchedAt) < PRACTICE_CHART_CACHE_TTL_MS);
}

function _getMarketChartGuessSeries(record = _ensureMarketChartGuessRecord()) {
  const cacheKey = _getMarketChartGuessCacheKey(record);
  return cacheKey ? _marketChartGuessCache[cacheKey] || null : null;
}

function _getMarketPredictionRecord() {
  if (typeof _ensureDailyPredictionRecord === 'function') {
    return _ensureDailyPredictionRecord();
  }
  return null;
}

function _isMarketPredictionRevealReady(record) {
  return typeof _isPredictionRevealReady === 'function'
    ? _isPredictionRevealReady(record)
    : false;
}

function _isMarketScreenActive() {
  return !!document.getElementById('marketScreen')?.classList.contains('active');
}

function _splitMarketChartGuessSeries(series) {
  const points = (series?.points || [])
    .map(point => ({
      time: Number(point?.time) || 0,
      value: Number(point?.value) || 0
    }))
    .filter(point => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.value));

  if (points.length < 8) return null;

  const minTailCount = Math.min(Math.max(4, Math.round(points.length * 0.2)), points.length - 3);
  const promptCount = Math.max(4, Math.min(points.length - minTailCount, Math.round(points.length * 0.68)));
  const promptPoints = points.slice(0, promptCount);
  const hiddenPoints = points.slice(promptCount);
  if (promptPoints.length < 4 || hiddenPoints.length < 3) return null;

  const domainStart = Number(series?.domainStart) || points[0].time;
  const domainEnd = Number(series?.domainEnd) || points[points.length - 1].time;

  return {
    fullSeries: {
      ...series,
      points,
      domainStart,
      domainEnd
    },
    promptSeries: {
      ...series,
      points: promptPoints,
      domainStart,
      domainEnd
    },
    continuationSeries: {
      ...series,
      points: points.slice(promptCount - 1),
      domainStart,
      domainEnd
    },
    promptPoints,
    hiddenPoints,
    handoffPoint: promptPoints[promptPoints.length - 1],
    lastPoint: points[points.length - 1],
    promptStartPoint: promptPoints[0],
    promptHigh: Math.max(...promptPoints.map(point => point.value)),
    promptLow: Math.min(...promptPoints.map(point => point.value)),
    tailHigh: Math.max(...hiddenPoints.map(point => point.value)),
    tailLow: Math.min(...hiddenPoints.map(point => point.value))
  };
}

function _classifyMarketChartGuessContinuation(game) {
  if (!game?.handoffPoint || !game?.lastPoint) return 'stayed_flat';

  const handoffValue = Number(game.handoffPoint.value) || 0;
  const promptStartValue = Number(game.promptStartPoint?.value) || handoffValue;
  const lastValue = Number(game.lastPoint.value) || handoffValue;
  if (handoffValue <= 0 || promptStartValue <= 0) return 'stayed_flat';

  const promptTrendPct = ((handoffValue - promptStartValue) / promptStartValue) * 100;
  const tailChangePct = ((lastValue - handoffValue) / handoffValue) * 100;
  const promptRangePct = ((Number(game.promptHigh) - Number(game.promptLow)) / handoffValue) * 100;
  const tailSwingPct = ((Number(game.tailHigh) - Number(game.tailLow)) / handoffValue) * 100;

  const flatThreshold = Math.max(0.55, promptRangePct * 0.24);
  const reversalThreshold = Math.max(0.95, promptRangePct * 0.35);
  const breakoutThreshold = Math.max(0.18, promptRangePct * 0.08);

  if (Math.abs(tailChangePct) <= flatThreshold && tailSwingPct <= Math.max(1.2, promptRangePct * 0.55)) {
    return 'stayed_flat';
  }

  const promptDirection = promptTrendPct > 0.2 ? 1 : promptTrendPct < -0.2 ? -1 : 0;
  const tailDirection = tailChangePct > flatThreshold ? 1 : tailChangePct < -flatThreshold ? -1 : 0;
  const brokeAbovePromptHigh = (((Number(game.tailHigh) - Number(game.promptHigh)) / handoffValue) * 100) > breakoutThreshold;
  const brokeBelowPromptLow = (((Number(game.promptLow) - Number(game.tailLow)) / handoffValue) * 100) > breakoutThreshold;

  if (promptDirection !== 0 && tailDirection !== 0 && promptDirection !== tailDirection && Math.abs(tailChangePct) >= reversalThreshold) {
    return 'reversed_sharply';
  }
  if (tailDirection > 0 || brokeAbovePromptHigh) return 'broke_out_higher';
  if (tailDirection < 0 || brokeBelowPromptLow) return 'faded_lower';
  return 'stayed_flat';
}

function _buildMarketChartGuessExplanation(outcomeKey, game) {
  const handoffValue = Number(game?.handoffPoint?.value) || 0;
  const lastValue = Number(game?.lastPoint?.value) || handoffValue;
  const tailChangePct = handoffValue > 0
    ? ((lastValue - handoffValue) / handoffValue) * 100
    : 0;
  const moveText = _formatUnsignedPct(tailChangePct, 1);

  if (outcomeKey === 'broke_out_higher') {
    return `After the setup, buyers stayed in control and the chart finished ${moveText} above the handoff point.`;
  }
  if (outcomeKey === 'faded_lower') {
    return `The setup lost momentum and price faded ${moveText} below the handoff point by the finish.`;
  }
  if (outcomeKey === 'reversed_sharply') {
    return `The first move did not hold. Price flipped direction and finished ${moveText} away from the handoff point.`;
  }
  return `After the setup, price mostly churned sideways and finished close to where the hidden section began.`;
}

function _buildMarketChartGuessGame(record, series) {
  const split = _splitMarketChartGuessSeries(series);
  if (!split) return null;

  const correctChoice = _classifyMarketChartGuessContinuation(split);
  const choiceKeys = Array.isArray(record?.choiceKeys) && record.choiceKeys.length
    ? record.choiceKeys.filter(key => !!MARKET_CHART_CHOICE_LIBRARY[key])
    : Object.keys(MARKET_CHART_CHOICE_LIBRARY);

  return {
    ...split,
    choiceKeys: choiceKeys.length ? choiceKeys : Object.keys(MARKET_CHART_CHOICE_LIBRARY),
    correctChoice,
    explanation: _buildMarketChartGuessExplanation(correctChoice, split)
  };
}

function _renderMarketChartGuessGraphic(game, { compact = false, reveal = false } = {}) {
  const primarySeries = reveal ? game?.fullSeries : game?.promptSeries;
  const chart = _buildPracticeStockChartGraphic(primarySeries);
  const promptChart = game?.promptSeries
    ? _buildPracticeStockChartGraphic(game.promptSeries)
    : null;
  if (!chart) {
    return `<div class="market-daily-chart-empty">Chart loading…</div>`;
  }

  const width = compact ? 260 : chart.width;
  const height = compact ? 120 : chart.height;
  const gradientId = `marketDailyGuessGradient-${game?.fullSeries?.symbol || 'chart'}-${compact ? 'compact' : 'modal'}-${reveal ? 'reveal' : 'setup'}`;
  const cutoffX = _roundPortfolioNumber(Number(promptChart?.lastPoint?.x) || (chart.width * 0.7), 1);
  const cutoffY = _roundPortfolioNumber(Number(promptChart?.lastPoint?.y) || (chart.height / 2), 1);
  const continuationChart = reveal && game?.continuationSeries
    ? _buildPracticeStockChartGraphic(game.continuationSeries)
    : null;

  return `
    <svg viewBox="0 0 ${chart.width} ${chart.height}" width="100%" height="${height}" preserveAspectRatio="none" aria-hidden="true" class="market-daily-chart-svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${chart.fillStart}"></stop>
          <stop offset="100%" stop-color="${chart.fillEnd}"></stop>
        </linearGradient>
      </defs>
      ${reveal ? `<path d="${chart.areaPath}" fill="url(#${gradientId})"></path>` : ''}
      ${!reveal ? `<rect x="${cutoffX}" y="0" width="${Math.max(0, chart.width - cutoffX)}" height="${chart.height}" fill="rgba(255,255,255,0.03)"></rect>` : ''}
      <polyline points="${chart.polyline}" fill="none" stroke="${chart.stroke}" stroke-width="${compact ? 2.6 : 3}" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${continuationChart ? `<polyline points="${continuationChart.polyline}" fill="none" stroke="${chart.stroke}" stroke-width="${compact ? 3 : 3.4}" stroke-linecap="round" stroke-linejoin="round"></polyline>` : ''}
      <line x1="${cutoffX}" y1="12" x2="${cutoffX}" y2="${chart.height - 22}" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" stroke-dasharray="4 5"></line>
      <circle cx="${cutoffX}" cy="${cutoffY}" r="${compact ? 3.2 : 3.8}" fill="${chart.stroke}"></circle>
    </svg>`;
}

async function refreshMarketChartGuess(force = false) {
  const record = _ensureMarketChartGuessRecord();
  if (!record?.symbol) return null;

  const cacheKey = _getMarketChartGuessCacheKey(record);
  if (!force && _isMarketChartGuessCacheFresh(_marketChartGuessCache[cacheKey])) {
    return _marketChartGuessCache[cacheKey];
  }
  if (_marketChartGuessFetchPending && !force) {
    return _marketChartGuessCache[cacheKey] || null;
  }

  const token = ++_marketChartGuessFetchToken;
  _marketChartGuessFetchPending = true;
  _marketChartGuessError = '';

  try {
    const payload = await _requestPracticeStockHistory(record.symbol, record.range || MARKET_DAILY_CHART_RANGE);
    if (token !== _marketChartGuessFetchToken) return null;
    _marketChartGuessCache[cacheKey] = {
      ...payload,
      symbol: record.symbol,
      _fetchedAt: Date.now()
    };
    return _marketChartGuessCache[cacheKey];
  } catch (err) {
    if (token !== _marketChartGuessFetchToken) return null;
    _marketChartGuessError = err instanceof Error ? err.message : 'Chart unavailable right now';
    return null;
  } finally {
    if (token === _marketChartGuessFetchToken) {
      _marketChartGuessFetchPending = false;
      if (_isMarketScreenActive() && typeof renderMarket === 'function') renderMarket();
      if (_marketChartGuessModalOpen) openMarketChartGuess();
    }
  }
}

function _getMarketChartGuessOutcomeCopy(record, game) {
  const asset = _findPracticeAsset(record?.symbol);
  if (!record || !asset) {
    return {
      title: 'What Happened Next?',
      sub: 'Study the setup, then choose the most likely ending.',
      tone: 'neutral'
    };
  }
  if (record.status === 'solved') {
    const correct = MARKET_CHART_CHOICE_LIBRARY[game?.correctChoice];
    return {
      title: 'Nice read',
      sub: `${asset.symbol} ${correct?.label?.toLowerCase() || 'played out cleanly'}. +${record.reward?.xpAwarded || 0} XP and +$${record.reward?.cashAwarded || 0}.`,
      tone: 'up'
    };
  }
  if (record.status === 'failed') {
    const correct = MARKET_CHART_CHOICE_LIBRARY[game?.correctChoice];
    return {
      title: 'Reveal',
      sub: `This setup belonged to ${asset.symbol}. It actually ${correct?.label?.toLowerCase() || 'finished differently than expected'}.`,
      tone: 'down'
    };
  }
  return {
    title: 'What Happened Next?',
    sub: 'Read the setup, then decide how the hidden section finished.',
    tone: 'neutral'
  };
}

function _renderMarketChartGuessOptionButtons(record, game) {
  const submitted = !!record?.submittedChoice;
  const choiceKeys = Array.isArray(game?.choiceKeys) ? game.choiceKeys : [];
  return `
    <div class="market-daily-option-grid">
      ${choiceKeys.map(choiceKey => {
        const choice = MARKET_CHART_CHOICE_LIBRARY[choiceKey];
        if (!choice) return '';
        const selected = record?.submittedChoice === choiceKey;
        const isCorrect = game?.correctChoice === choiceKey;
        const stateClass = submitted
          ? isCorrect
            ? 'is-correct'
            : selected
              ? 'is-wrong'
              : ''
          : '';
        return `
          <button class="market-daily-option ${stateClass}"
            onclick="submitMarketChartGuessChoice('${choiceKey}')"
            ${submitted ? 'disabled' : ''}>
            <span class="market-daily-option-label">${choice.label}</span>
            <span class="market-daily-option-copy">${choice.copy}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function _renderMarketChartGuessModalBody() {
  const record = _ensureMarketChartGuessRecord();
  const asset = _findPracticeAsset(record?.symbol);
  const series = _getMarketChartGuessSeries(record);
  const game = _buildMarketChartGuessGame(record, series);
  const outcome = _getMarketChartGuessOutcomeCopy(record, game);
  const hasChart = !!game;
  const selectedChoice = MARKET_CHART_CHOICE_LIBRARY[record?.submittedChoice];
  const correctChoice = MARKET_CHART_CHOICE_LIBRARY[game?.correctChoice];
  const chartMeta = record?.submittedChoice
    ? 'Full reveal'
    : 'Setup only';
  const chartMetaSub = record?.submittedChoice
    ? 'Here is the real continuation.'
    : 'The ending is hidden.';

  return `
    <div class="daily-loop-shell">
      <div class="daily-loop-kicker">What Happened Next?</div>
      <div class="daily-loop-title">${outcome.title}</div>
      <div class="daily-loop-sub">${_escapeMarketHtml(outcome.sub)}</div>
      ${hasChart ? `
        <div class="market-daily-chart-meta">
          <div class="market-daily-chart-meta-title">${chartMeta}</div>
          <div class="market-daily-chart-meta-sub">${chartMetaSub}</div>
        </div>
      ` : ''}
      <div class="market-daily-chart-shell">
        ${hasChart ? _renderMarketChartGuessGraphic(game, { reveal: !!record?.submittedChoice }) : _marketChartGuessFetchPending ? `
          <div class="market-daily-chart-empty">Loading the chart…</div>
        ` : _marketChartGuessError ? `
          <div class="market-daily-chart-empty">${_escapeMarketHtml(_marketChartGuessError)}</div>
        ` : `
          <div class="market-daily-chart-empty">Fetching today’s chart…</div>
        `}
      </div>
      ${hasChart && record?.submittedChoice ? `
        <div class="market-daily-answer-lock ${record.status === 'solved' ? 'success' : ''}">
          ${record.status === 'solved'
            ? `You nailed it. ${asset?.symbol || record.symbol} ${correctChoice?.label?.toLowerCase() || 'finished the way you called it'}.`
            : `Locked for today. ${asset?.symbol || record.symbol} actually ${correctChoice?.label?.toLowerCase() || 'finished differently'}.`}
        </div>
        <div class="market-daily-answer-detail">
          <div class="market-daily-answer-pill">Your pick: ${selectedChoice?.label || 'No answer'}</div>
          <div class="market-daily-answer-pill is-correct">Actual ending: ${correctChoice?.label || 'Unavailable'}</div>
        </div>
        <div class="daily-hint-box daily-hint-box-muted market-daily-answer-explanation">${_escapeMarketHtml(record?.explanation || game?.explanation || '')}</div>
      ` : hasChart ? `
        <div class="daily-hint-box daily-hint-box-muted">Use the setup, momentum, and volatility to choose the most believable ending.</div>
      ` : _marketChartGuessError ? `
        <button class="btn btn-secondary market-daily-action-btn" onclick="retryMarketChartGuess()">Retry Chart</button>
      ` : ''}
      ${hasChart ? _renderMarketChartGuessOptionButtons(record, game) : ''}
    </div>`;
}

function openMarketChartGuess() {
  const chartGuess = _ensureMarketDailyLoopState();
  chartGuess.lastOpenedOn = today();
  const record = _ensureMarketChartGuessRecord();
  save();
  _marketChartGuessModalOpen = true;

  showAppModal({
    icon: 'neutral',
    title: 'What Happened Next?',
    body: _renderMarketChartGuessModalBody(),
    bodyIsHTML: true,
    actions: [],
    showClose: true,
    boxClass: 'daily-loop-modal',
    onClose: () => {
      _marketChartGuessModalOpen = false;
    }
  });

  const series = _getMarketChartGuessSeries(record);
  if ((!series || !_isMarketChartGuessCacheFresh(series)) && !_marketChartGuessFetchPending) {
    refreshMarketChartGuess(false);
  }
}

function retryMarketChartGuess() {
  _marketChartGuessError = '';
  openMarketChartGuess();
  refreshMarketChartGuess(true);
}

function submitMarketChartGuessChoice(symbol) {
  const record = _ensureMarketChartGuessRecord();
  const game = _buildMarketChartGuessGame(record, _getMarketChartGuessSeries(record));
  const choiceKey = String(symbol || '').trim();
  if (!record || record.submittedChoice || !game || !MARKET_CHART_CHOICE_LIBRARY[choiceKey]) return;

  record.submittedChoice = choiceKey;
  record.submittedAt = new Date().toISOString();
  record.revealedAt = record.submittedAt;
  record.correctChoice = game.correctChoice;
  record.explanation = game.explanation;
  record.status = choiceKey === game.correctChoice ? 'solved' : 'failed';

  if (record.status === 'solved' && !record.rewardId) {
    const rewardId = `market-chart-guess:${record.promptId}`;
    record.rewardId = rewardId;
    record.reward = awardRewards({
      baseXp: MARKET_CHART_GUESS_REWARD.xp,
      baseCash: MARKET_CHART_GUESS_REWARD.cash,
      source: 'market_chart_guess',
      meta: {
        rewardId
      }
    });
    if (record.reward?.xpAwarded) showXpPop(record.reward.xpAwarded);
    if (typeof showCashPop === 'function' && record.reward?.cashAwarded) {
      showCashPop(record.reward.cashAwarded);
    }
    showToast('Nice read', 'success');
  } else {
    record.reward = null;
    showToast('Reveal locked in for today', 'error');
  }

  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof renderMarket === 'function') renderMarket();
  openMarketChartGuess();
}

async function _requestLivePracticeQuotes() {
  const symbols = PRACTICE_MARKET_ASSETS.map(asset => asset.symbol).join(',');
  return _fetchMarketJson(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
    notFoundMessage: 'Quote API route not found. Serve the app with python3 server.py so /api/quotes is available.',
    invalidPayloadMessage: 'Quote payload missing'
  });
}

function _applyLivePracticeQuotes(payload) {
  const { portfolio } = _ensurePracticePortfolio();
  let applied = 0;
  PRACTICE_MARKET_ASSETS.forEach(asset => {
    const next = payload?.[asset.symbol];
    if (_applyPracticeQuoteToAssetState(portfolio, asset, next)) applied++;
  });

  if (!applied) return 0;

  portfolio.lastPriceRefreshOn = today();
  _recordPracticePortfolioHistory();
  _invalidateMarketPortfolioChart();
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  save();
  return applied;
}

function _stopPracticePortfolioRefresh() {
  if (_portfolioRefreshTimer) {
    clearInterval(_portfolioRefreshTimer);
    _portfolioRefreshTimer = null;
  }
}

function _startPracticePortfolioRefresh() {
  _stopPracticePortfolioRefresh();
  _portfolioRefreshTimer = setInterval(() => {
    if (!_isPortfolioSimulatorOpen()) {
      _stopPracticePortfolioRefresh();
      return;
    }
    if (_portfolioFetchPending) return;
    refreshPracticePortfolioQuotes(false);
  }, PRACTICE_QUOTE_REFRESH_MS);
}

async function refreshPracticePortfolioQuotes(force = false) {
  if (_portfolioFetchPending) return false;
  const token = ++_portfolioFetchToken;
  _portfolioFetchPending = true;
  if (_isPortfolioSimulatorOpen()) _renderPortfolioSimulatorModal();

  try {
    const payload = await _requestLivePracticeQuotes();
    if (token !== _portfolioFetchToken) return false;
    const applied = _applyLivePracticeQuotes(payload);
    if (!applied) throw new Error('No live quotes returned');
    _portfolioQuoteMode = 'live';
    const fetchedAt = _formatPortfolioQuoteTimestamp(_getPracticePortfolioSummary().portfolio);
    _portfolioQuoteStatus = fetchedAt
      ? `Live quotes updated at ${fetchedAt} and refresh every 45 seconds`
      : 'Live quotes updated just now and refresh every 45 seconds';
    if (_portfolioDetailSymbol && (_isPortfolioSimulatorOpen() || _isStandaloneStockDetailOpen())) {
      refreshPracticeStockHistory(_portfolioDetailRange === '1D');
    }
    if (typeof renderMarket === 'function') renderMarket();
    _restoreMarketSearchFocusIfNeeded();
    _syncMarketSearchUi();
    return true;
  } catch (err) {
    if (token !== _portfolioFetchToken) return false;
    _portfolioQuoteMode = 'simulated';
    _portfolioQuoteStatus = err instanceof Error
      ? err.message
      : 'Unable to refresh live quotes right now';
    if (force && typeof showToast === 'function') {
      showToast(_portfolioQuoteStatus, 'error');
    }
    if (typeof renderMarket === 'function') renderMarket();
    _restoreMarketSearchFocusIfNeeded();
    _syncMarketSearchUi();
    return false;
  } finally {
    if (token === _portfolioFetchToken) {
      _portfolioFetchPending = false;
      if (_isPortfolioSimulatorOpen()) _renderPortfolioSimulatorModal();
    }
  }
}

function _renderAssetListMarkup(summary, options = {}) {
  const symbols = Array.isArray(options.symbols) ? options.symbols : null;
  const assetsOverride = Array.isArray(options.assets) ? options.assets : null;
  const supportingTextBySymbol = options.supportingTextBySymbol && typeof options.supportingTextBySymbol === 'object'
    ? options.supportingTextBySymbol
    : null;
  const assets = assetsOverride
    ? assetsOverride
    : symbols
    ? symbols.map(symbol => _findPracticeAsset(symbol)).filter(Boolean)
    : PRACTICE_MARKET_ASSETS;
  return `
    <div class="market-stock-bank">
      ${assets.map(asset => _renderMarketAssetRow(asset, summary, {
        supportingText: supportingTextBySymbol?.[asset.symbol] || '',
        supportingClass: supportingTextBySymbol?.[asset.symbol] ? 'muted' : ''
      })).join('')}
    </div>`;
}

function _renderAssetOverviewMarkup(asset) {
  const profile = _getAssetOverviewProfile(asset);
  const isCrypto = _isCryptoAsset(asset);
  const facts = [];
  if (profile?.ticker) facts.push({ label: 'Ticker', value: profile.ticker });
  if (profile?.sector) facts.push({ label: 'Sector', value: profile.sector });
  if (profile?.industry) facts.push({ label: 'Industry', value: profile.industry });
  if (profile?.marketCap) facts.push({ label: 'Market Cap', value: _formatCompactMarketCap(profile.marketCap) });
  if (profile?.exchange) facts.push({ label: 'Exchange', value: profile.exchange });
  if (profile?.headquarters) facts.push({ label: 'HQ', value: profile.headquarters });

  const description = profile?.description
    || asset?.lesson
    || `${asset?.symbol || 'This asset'} is available in your practice portfolio. Open the chart, read the price action, and build a simple thesis before trading.`;

  if (!profile && _portfolioDetailProfilePending && !isCrypto) {
    return `
      <div class="market-panel-card">
        <div class="market-panel-head">
          <div>
            <div class="market-panel-title">About</div>
            <div class="market-panel-copy">Loading company overview…</div>
          </div>
        </div>
        <div class="market-empty-state">
          <div class="market-empty-copy">Pulling sector, industry, market cap, and company context for ${asset.symbol}.</div>
        </div>
      </div>`;
  }

  if (!profile && !isCrypto) {
    return `
      <div class="market-panel-card">
        <div class="market-panel-head">
          <div>
            <div class="market-panel-title">About</div>
            <div class="market-panel-copy">Company overview unavailable right now.</div>
          </div>
        </div>
        <div class="market-empty-state">
          <div class="market-empty-title">Overview unavailable</div>
          <div class="market-empty-copy">${_escapeMarketHtml(_portfolioDetailProfileError || `We could not load company details for ${asset.symbol} right now.`)}</div>
        </div>
      </div>`;
  }

  return `
    <div class="market-panel-card">
      <div class="market-panel-head">
        <div>
          <div class="market-panel-title">About ${_escapeMarketHtml(profile?.companyName || asset?.name || asset?.symbol || '')}</div>
          <div class="market-panel-copy">${isCrypto ? 'A quick learning snapshot for this 24/7 asset.' : 'A quick company read before you trade.'}</div>
        </div>
      </div>
      <div class="market-stock-overview-copy">${_escapeMarketHtml(description)}</div>
      ${facts.length ? `
        <div class="market-stock-overview-facts">
          ${facts.map(item => `
            <div class="market-stock-overview-fact">
              <span>${item.label}</span>
              <strong>${_escapeMarketHtml(item.value)}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="market-stock-overview-tags">
        <span>${_getAssetTypeLabel(asset)}</span>
        <span>${_escapeMarketHtml(asset.category)}</span>
        ${profile?.source ? `<span>${_escapeMarketHtml(profile.source === 'local' ? 'Local fallback' : 'Live company data')}</span>` : ''}
      </div>
    </div>`;
}

function _renderStockDetailMarkup(summary) {
  const asset = _findPracticeAsset(_portfolioDetailSymbol);
  if (!asset) return '';

  const market = summary.portfolio.assets[asset.symbol] || _createPracticeAssetState(asset);
  const statusBadge = _renderAssetMarketStatusBadge(asset);
  const isWatchlisted = _isPracticeAssetWatchlisted(asset.symbol, summary.portfolio);
  const holding = _getPracticeHoldingSnapshot(summary, asset.symbol);
  const selectedQuantity = _getSelectedShareQuantity(asset.symbol);
  const selectedCost = _roundPortfolioNumber(selectedQuantity * (Number(market.price) || 0), 2);
  const sellableQuantity = _roundPortfolioNumber(Number(holding?.quantity) || 0, 6);
  const minimum = _getMinimumTradeQuantity(asset);
  const quantityLabel = _isCryptoAsset(asset) ? 'Amount' : 'Quantity';
  const positionQuantityLabel = _isCryptoAsset(asset) ? 'Units owned' : 'Shares owned';
  const tradeTitle = holding ? `Trade ${asset.symbol}` : `Buy ${asset.symbol}`;
  const buyCopy = holding
    ? (_isCryptoAsset(asset)
      ? 'Use the controls below to buy more or sell some of your current crypto position.'
      : 'Use the controls below to buy more or sell the shares you already own.')
    : (_isCryptoAsset(asset)
      ? 'Use + / - or type an exact crypto amount before you place the trade.'
      : 'Stocks and ETFs stay whole-share only in the simulator.');
  const canAfford = selectedCost <= summary.cashAvailable + 1e-6;
  const canSell = !!holding && sellableQuantity > 0 && selectedQuantity <= sellableQuantity + 1e-6;
  const chartSeries = _getPracticeChartSeries(asset.symbol, _portfolioDetailRange);
  const chart = _buildPracticeStockChartGraphic(chartSeries);
  const gradientId = `marketStockGradient-${asset.symbol}-${_portfolioDetailRange}`;
  const selectedRangeLabel = _getStockChartRangeLabel(_portfolioDetailRange);
  const detailEyebrow = `${_getAssetTypeLabel(asset)} Detail`;
  const isStockDayRange = _portfolioDetailRange === '1D' && !_isCryptoAsset(asset);
  const livePrice = Number(market.price) || Number(chart?.lastValue) || 0;
  const rangeBaseline = Number(chart?.firstValue);
  const displayChange = Number.isFinite(rangeBaseline) && rangeBaseline > 0
    ? _roundPortfolioNumber(livePrice - rangeBaseline, 2)
    : _roundPortfolioNumber(Number(market.dailyChange) || 0, 2);
  const displayChangePct = Number.isFinite(rangeBaseline) && rangeBaseline > 0
    ? _roundPortfolioNumber((displayChange / rangeBaseline) * 100, 2)
    : _roundPortfolioNumber(Number(market.dailyChangePct) || 0, 2);
  const displayChangeClass = displayChange >= 0 ? 'up' : 'down';
  const displayChangeText = `${_formatSignedUsd(displayChange, 2)} · ${_formatSignedPct(displayChangePct)}`;
  const extendedHours = _getAssetDetailExtendedHoursSummary(asset, market);
  const chartStatusCopy = _portfolioChartPending
    ? `Refreshing ${asset.symbol} chart…`
    : (_formatChartUpdateTime(chartSeries?.asOf) ? `Updated ${_formatChartUpdateTime(chartSeries?.asOf)}` : 'Live simulated price');

  _setPracticeChartScrubModel({
    asset,
    range: _portfolioDetailRange,
    chart,
    priceText: _formatUsd(market.price, 2),
    changeText: displayChangeText,
    changePositive: displayChange >= 0,
    statusText: chartStatusCopy
  });

  return `
    <div class="market-stock-detail">
      <div class="market-stock-sheet-head">
        <div>
          <div class="market-stock-sheet-eyebrow">${detailEyebrow}</div>
          <div class="market-stock-sheet-title">${asset.symbol}</div>
        </div>
        <div class="market-stock-sheet-actions">
          <button
            type="button"
            class="market-watch-toggle${isWatchlisted ? ' is-active' : ''}"
            onclick="togglePracticeAssetWatchlist('${asset.symbol}')"
            aria-pressed="${isWatchlisted ? 'true' : 'false'}"
            aria-label="${isWatchlisted ? `Remove ${asset.symbol} from watchlist` : `Add ${asset.symbol} to watchlist`}">
            <svg viewBox="0 0 24 24" fill="${isWatchlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9">
              <path d="M12 17.2l-5.45 3.05 1.04-6.12L3 9.75l6.16-.9L12 3.3l2.84 5.55 6.16.9-4.59 4.38 1.05 6.12z"></path>
            </svg>
            <span>${isWatchlisted ? 'Watching' : 'Watch'}</span>
          </button>
          <button class="mkt-close-btn market-stock-sheet-close" onclick="closePracticeStockDetail()" aria-label="Close asset detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:14px;height:14px;">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="market-stock-chart-card">
        <div class="market-stock-chart-identity">
          <div class="market-stock-hero-meta">
            <div class="market-stock-kicker">${asset.category}</div>
            ${statusBadge}
          </div>
          <div class="market-stock-hero-symbol">${asset.symbol}</div>
          <div class="market-stock-hero-name">${asset.name}</div>
        </div>
        <div class="market-stock-chart-topline">
          <div>
            <div class="market-chart-label">${selectedRangeLabel}</div>
            <div id="marketStockChartStatus" class="market-stock-chart-status">${chartStatusCopy}</div>
          </div>
        </div>

        <div id="marketStockChartPrice" class="market-stock-chart-price">${_formatUsd(market.price, 2)}</div>
        <div id="marketStockChartChange" class="market-stock-chart-change ${displayChangeClass}">
          ${displayChangeText}
        </div>
        ${extendedHours ? `
          <div class="market-stock-extended-line ${extendedHours.tone}">
            <span class="market-stock-extended-label">${extendedHours.label}</span>
            <span class="market-stock-extended-value">${extendedHours.priceText}${extendedHours.changeText ? ` (${extendedHours.changeText})` : ''}</span>
          </div>
        ` : ''}
        <div class="market-stock-chart-copy">
          ${isStockDayRange
            ? `Current Eastern calendar day for ${asset.symbol}`
            : _portfolioDetailRange === 'MAX'
              ? `Full available history for ${asset.symbol}`
            : _portfolioDetailRange === '1D'
              ? `Past 24 hours for ${asset.symbol}`
              : `${selectedRangeLabel} performance for ${asset.symbol}`}
        </div>

        ${_portfolioChartPending && !chart ? `
          <div class="market-stock-chart-empty market-stock-chart-stage">Loading ${asset.symbol} chart…</div>
        ` : _portfolioChartError && !chart ? `
          <div class="market-stock-chart-empty market-stock-chart-stage">${_portfolioChartError}</div>
        ` : chart ? `
          <div
            id="marketStockChartStage"
            class="market-stock-chart-stage is-interactive"
            onpointerdown="startPracticeChartScrub(event)"
            onpointermove="movePracticeChartScrub(event)"
            onpointerup="endPracticeChartScrub(event)"
            onpointercancel="endPracticeChartScrub(event)"
            onlostpointercapture="endPracticeChartScrub(event)"
          >
            <svg class="market-stock-chart-svg" viewBox="0 0 ${chart.width} ${chart.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              ${chart.guideLines.map(y => `
                <line class="market-stock-chart-guideline" x1="0" x2="${chart.width}" y1="${y}" y2="${y}"></line>
              `).join('')}
              <defs>
                <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="${chart.fillStart}"></stop>
                  <stop offset="100%" stop-color="${chart.fillEnd}"></stop>
                </linearGradient>
              </defs>
              <path d="${chart.areaPath}" fill="url(#${gradientId})"></path>
              <polyline points="${chart.polyline}" fill="none" stroke="${chart.stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>
              <line id="marketStockChartScrubLine" class="market-stock-chart-scrub-line" x1="${chart.lastPoint.x}" x2="${chart.lastPoint.x}" y1="0" y2="${chart.height}"></line>
              <circle id="marketStockChartCurrentHalo" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="3.2" fill="${chart.stroke}" fill-opacity="0.14"></circle>
              <circle id="marketStockChartCurrentDot" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="1.8" fill="${chart.stroke}"></circle>
              <circle id="marketStockChartScrubHalo" class="market-stock-chart-scrub-halo" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="6"></circle>
              <circle id="marketStockChartScrubDot" class="market-stock-chart-scrub-dot" cx="${chart.lastPoint.x}" cy="${chart.lastPoint.y}" r="2.3"></circle>
            </svg>
          </div>
        ` : `
          <div class="market-stock-chart-empty market-stock-chart-stage">No chart data yet for this range.</div>
        `}
        <div class="market-timeframe-row-wrap">
          <div class="market-timeframe-row" role="tablist" aria-label="Chart range selector">
            ${STOCK_CHART_TIMEFRAMES.map(range => `
              <button
                class="market-timeframe-btn ${range === _portfolioDetailRange ? 'active' : ''}"
                onclick="setPracticeStockTimeframe('${range}')"
                role="tab"
                aria-selected="${range === _portfolioDetailRange ? 'true' : 'false'}">
                ${range}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="market-stock-chart-meta">
          <div class="market-stock-chart-stat">
            <span>Range</span>
            <strong>${_formatUsd(chart?.low ?? market.low ?? market.price, 2)} to ${_formatUsd(chart?.high ?? market.high ?? market.price, 2)}</strong>
          </div>
          <div class="market-stock-chart-stat">
            <span>${_portfolioDetailRange === '1D' ? 'Day change' : _portfolioDetailRange === 'MAX' ? 'Full-history move' : `${_portfolioDetailRange} move`}</span>
            <strong id="marketStockChartMetaMoveValue" class="${displayChangeClass}">${displayChangeText}</strong>
          </div>
          <div class="market-stock-chart-stat">
            <span>Market status</span>
            <strong>${_getAssetMarketStatus(asset).label}</strong>
          </div>
        </div>
      </div>

      <div class="market-stock-detail-grid">
        ${_renderAssetOverviewMarkup(asset)}

        <div class="market-panel-card">
          <div class="market-panel-head">
            <div>
              <div class="market-panel-title">${holding ? 'Holdings' : 'No holdings'}</div>
              <div class="market-panel-copy">${holding ? 'Your current exposure to this asset.' : 'Buy this asset to start tracking it inside your practice portfolio.'}</div>
            </div>
          </div>
          ${holding ? `
            <div class="market-stock-position-grid">
              <div class="market-position-stat">
                <span>${positionQuantityLabel}</span>
                <strong>${_formatHoldingQuantity(asset.symbol, holding.quantity)}</strong>
              </div>
              <div class="market-position-stat">
                <span>Current value</span>
                <strong>${_formatUsd(holding.currentValue, 2)}</strong>
              </div>
              <div class="market-position-stat">
                <span>Gain / loss</span>
                <strong class="${holding.gainLoss >= 0 ? 'up' : 'down'}">${_formatSignedUsd(holding.gainLoss, 2)}</strong>
              </div>
              <div class="market-position-stat">
                <span>Average cost</span>
                <strong>${_formatUsd(holding.averageCost, 2)}</strong>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

	      <div class="market-panel-card">
	        <div class="market-panel-head">
	          <div>
	            <div class="market-panel-title">${tradeTitle}</div>
	            <div class="market-panel-copy">${buyCopy}</div>
	          </div>
	        </div>
        <div class="market-share-stepper">
          <button class="market-share-btn" onclick="adjustPracticeShareQuantity('${asset.symbol}', -1)" ${_isAtMinimumTradeQuantity(asset, selectedQuantity) ? 'disabled' : ''}>-</button>
          <div class="market-share-readout">
            <div class="market-share-label">${quantityLabel}</div>
            <div class="market-share-value">${_formatTradeQuantity(asset, selectedQuantity)}</div>
          </div>
          <button class="market-share-btn" onclick="adjustPracticeShareQuantity('${asset.symbol}', 1)">+</button>
        </div>
        ${_isCryptoAsset(asset) ? `
          <div class="market-quantity-input-shell">
            <label class="market-quantity-input-label" for="marketQuantityInput-${asset.symbol}">Exact amount</label>
            <input
              id="marketQuantityInput-${asset.symbol}"
              class="market-quantity-input"
              type="number"
              inputmode="decimal"
              min="${minimum}"
              step="${asset.inputStep || 0.000001}"
              value="${_formatTradeInputValue(asset, selectedQuantity)}"
              onchange="setPracticeShareQuantity('${asset.symbol}', this.value)"
              onblur="setPracticeShareQuantity('${asset.symbol}', this.value)"
            />
          </div>
        ` : ''}
		        <div class="market-estimate-row">
		          <span>${holding ? 'Estimated trade value' : 'Estimated cost'}</span>
		          <strong>${_formatUsd(selectedCost, 2)}</strong>
		        </div>
	        <div class="market-buy-actions">
	          <button type="button" class="market-buy-btn" onclick="buyPracticeAssetShares('${asset.symbol}')" ${canAfford ? '' : 'disabled'}>
	            Buy ${asset.symbol}
	          </button>
            ${holding ? `
              <button type="button" class="market-buy-btn market-sell-btn" onclick="sellPracticeAssetShares('${asset.symbol}')" ${canSell ? '' : 'disabled'}>
                Sell ${asset.symbol}
              </button>
            ` : ''}
	        </div>
	        <div class="market-trade-note">Simulated trading stays open 24/7. Real-world market hours still apply.</div>
	        ${canAfford ? '' : `<div class="market-trade-hint">Earn ${_formatUsd(selectedCost - summary.cashAvailable, 2)} more to place this trade.</div>`}
          ${holding && !canSell ? `<div class="market-trade-hint">Adjust the order to ${_formatHoldingQuantity(asset.symbol, sellableQuantity)} or less to sell.</div>` : ''}
	      </div>
	    </div>`;
}

function _renderStockDetailSheet(summary) {
  if (!_portfolioDetailSymbol) return '';
  return `
    <div class="market-stock-sheet-wrap">
      <button class="market-stock-sheet-backdrop" aria-label="Close asset detail" onclick="closePracticeStockDetail()"></button>
      <section class="market-stock-sheet" aria-label="${_portfolioDetailSymbol} asset details">
        <div class="market-stock-sheet-grabber" aria-hidden="true"></div>
        ${_renderStockDetailMarkup(summary)}
      </section>
    </div>`;
}

function _renderStandaloneStockDetailModal() {
  const box = document.getElementById('marketModalBox');
  if (!box || !_portfolioDetailSymbol) return;
  box.classList.add('market-modal-box-stock-detail');
  const summary = _getPracticePortfolioSummary();
  box.innerHTML = `
    <section class="market-stock-sheet market-stock-sheet-standalone" aria-label="${_portfolioDetailSymbol} asset details">
      <div class="market-stock-sheet-grabber" aria-hidden="true"></div>
      ${_renderStockDetailMarkup(summary)}
    </section>`;
}

function _renderPortfolioSimulatorModal() {
  const box = document.getElementById('marketModalBox');
  if (!box) return;
  box.classList.remove('market-modal-box-stock-detail');

  const ensured = _ensurePracticePortfolio();
  const summary = _getPracticePortfolioSummary();
  const spark = _buildPortfolioSparkline(summary);
  const quoteStatus = _buildPortfolioStatusCopy(summary);
  const quoteTone = _portfolioQuoteMode === 'live' ? 'live' : 'fallback';

  if (ensured.changed || summary.portfolio.history.length === 0) {
    _recordPracticePortfolioHistory();
    save();
  }

  box.innerHTML = `
    <div class="mkt-modal-header">
      <button class="mkt-close-btn" onclick="_closeMarketModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:14px;height:14px;">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="mkt-modal-title">Stock Market Simulation</div>
      <div class="mkt-modal-prog">${_portfolioQuoteMode === 'live' ? 'Live' : 'Practice'}</div>
    </div>
    <div class="mkt-scroll-body">
      <section class="market-practice-shell market-practice-shell-modal" id="marketPracticePortfolioShell">
      <div class="market-sim-hero">
        <div class="market-portfolio-head market-portfolio-head-compact">
          <div>
            <div class="market-portfolio-kicker">Portfolio</div>
            <div class="market-portfolio-title">Practice portfolio</div>
            <div class="market-portfolio-copy">One place to track value, check your positions, and place a trade.</div>
          </div>
          <button class="btn btn-secondary market-simulate-btn" onclick="refreshPracticePortfolioQuotes(true)" ${_portfolioFetchPending ? 'disabled' : ''}>${_portfolioFetchPending ? 'Refreshing...' : 'Refresh Prices'}</button>
        </div>
        <div class="market-sim-value">${_formatUsd(summary.portfolioValue)}</div>
        <div class="market-sim-change ${summary.todayChange >= 0 ? 'up' : 'down'}">${_formatSignedUsd(summary.todayChange)} · ${_formatSignedPct(summary.todayChangePct)}</div>
        <div class="market-chart-card market-chart-card-sim">
          <div class="market-chart-label">Portfolio trend</div>
          <div class="market-portfolio-chart-stage market-portfolio-chart-stage-sim">
            <svg viewBox="0 0 ${spark.width} ${spark.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" class="market-portfolio-chart-svg">
              <polyline points="${spark.points}" fill="none" stroke="${spark.stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
            </svg>
          </div>
        </div>
        <div class="market-sim-meta-row">
          <div class="market-inline-stat">
            <span>Purchasing Power</span>
            <strong>${_formatUsd(summary.cashAvailable)}</strong>
          </div>
          <div class="market-inline-stat">
            <span>Mode</span>
            <strong>${_portfolioQuoteMode === 'live' ? 'Live prices' : 'Stored prices'}</strong>
          </div>
        </div>
        <div class="market-data-status ${quoteTone}">
          ${quoteStatus}
        </div>
        <div class="market-sim-note">Simulated trading stays open 24/7. Real-world market hours still apply.</div>
      </div>

      ${_renderMarketSearchSlotMarkup()}

      ${summary.holdings.length ? `
        <div class="market-list-section market-list-section-sim">
          ${_renderMarketSectionHead(
            'Holdings',
            `${summary.holdings.length} live position${summary.holdings.length === 1 ? '' : 's'} · ${_formatUsd(summary.holdingsValue)} at current value`
          )}
          ${_renderHoldingsMarkup(summary)}
        </div>
      ` : `
        <div class="market-list-section market-list-section-sim market-list-section-empty">
          ${_renderMarketEmptyStateWithAction(
            'No holdings',
            'Add holding',
            "focusMarketSearch()",
            { extraClass: 'market-empty-state-holdings' }
          )}
        </div>
      `}

      ${_getPracticeWatchlistSymbols(summary?.portfolio).length ? `
        <div class="market-list-section market-list-section-sim">
          ${_renderMarketSectionHead(
            'Watchlist',
            'Saved names for quick re-entry into charts and trades.'
          )}
          ${_renderWatchlistMarkup(summary)}
        </div>
      ` : `
        <div class="market-list-section market-list-section-sim market-list-section-empty">
          ${_renderMarketEmptyStateWithAction(
            'No watchlist',
            'Add to watchlist',
            'focusMarketSearch()',
            { extraClass: 'market-empty-state-watchlist' }
          )}
        </div>
      `}

      <div class="market-list-section market-list-section-sim">
        ${_renderMarketSectionHead(
          'Blue Chip Picks',
          'Guided starter ideas for first positions and future search results.'
        )}
        ${_renderMarketBlueChipPicksMarkup(summary)}
      </div>

      <div class="market-list-section market-list-section-sim">
        ${_renderMarketSectionHead(
          'Browse Market',
          'Tap any asset to open its chart, position, and trade controls.'
        )}
        ${_renderAssetListMarkup(summary)}
      </div>
    </section>
    </div>
    ${_renderStockDetailSheet(summary)}`;
}

function adjustPracticeShareQuantity(symbol, direction) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return;
  const step = Number(asset.shareStep) || 1;
  const current = _getSelectedShareQuantity(symbol);
  const delta = direction > 0 ? step : -step;
  const next = _normalizeTradeQuantity(asset, current + delta, {
    clampMin: true,
    fallback: _getDefaultTradeQuantity(asset)
  });
  _portfolioShareSelections[symbol] = next;
  _renderActivePracticeStockDetailSheet();
}

function setPracticeShareQuantity(symbol, value) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return;
  _portfolioShareSelections[symbol] = _normalizeTradeQuantity(asset, value, {
    clampMin: true,
    fallback: _getSelectedShareQuantity(symbol)
  });
  _renderActivePracticeStockDetailSheet();
}

function buyPracticeAssetShares(symbol) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return;

  const quantity = _normalizeTradeQuantity(asset, _getSelectedShareQuantity(symbol), {
    clampMin: true,
    fallback: _getDefaultTradeQuantity(asset)
  });
  if (quantity <= 0) return;

  const { portfolio } = _ensurePracticePortfolio();
  const market = portfolio.assets[asset.symbol] || _createPracticeAssetState(asset);
  const purchaseAmount = _roundPortfolioNumber(quantity * (Number(market.price) || asset.basePrice), 2);
  if (purchaseAmount <= 0) return;
  if ((S.cash || 0) < purchaseAmount) {
    if (typeof showToast === 'function') {
      showToast('Not enough cash - earn more by answering correctly', 'error');
    }
    return;
  }

  const holding = portfolio.holdings[asset.symbol] || {
    symbol: asset.symbol,
    quantity: 0,
    totalCost: 0,
    lots: 0,
    lastBoughtAt: null
  };

  holding.quantity = _roundPortfolioNumber((Number(holding.quantity) || 0) + quantity, 6);
  holding.totalCost = _roundPortfolioNumber((Number(holding.totalCost) || 0) + purchaseAmount, 2);
  holding.lots = Math.max(0, Number(holding.lots) || 0) + 1;
  holding.lastBoughtAt = new Date().toISOString();
  portfolio.holdings[asset.symbol] = holding;
  _portfolioShareSelections[symbol] = _getDefaultTradeQuantity(asset);

  S.cash = _roundPortfolioNumber((S.cash || 0) - purchaseAmount, 2);
  _recordPortfolioTrade('buy', asset, quantity, purchaseAmount, Number(market.price) || asset.basePrice);
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  clearMarketRewardPrompt({ rerender: false, persist: false });
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  _renderActivePracticeStockDetailSheet();
  if (typeof renderMarket === 'function') renderMarket();
  if (typeof showToast === 'function') {
    showToast(`Bought ${_formatTradeQuantity(asset, quantity)} of ${asset.symbol} for ${_formatUsd(purchaseAmount, 2)}. ${asset.lesson}`, 'success');
  }
}

function sellPracticeAssetShares(symbol) {
  const asset = _findPracticeAsset(symbol);
  if (!asset) return;

  const { portfolio } = _ensurePracticePortfolio();
  const holding = portfolio.holdings[asset.symbol];
  const ownedQuantity = _roundPortfolioNumber(Number(holding?.quantity) || 0, 6);
  if (!holding || ownedQuantity <= 0) {
    if (typeof showToast === 'function') showToast(`You do not own any ${asset.symbol} to sell.`, 'error');
    return;
  }

  const quantity = _normalizeTradeQuantity(asset, _getSelectedShareQuantity(symbol), {
    clampMin: true,
    fallback: _getDefaultTradeQuantity(asset)
  });
  if (quantity <= 0) return;
  if (quantity > ownedQuantity + 1e-6) {
    if (typeof showToast === 'function') {
      showToast(`Adjust the order to ${_formatHoldingQuantity(asset.symbol, ownedQuantity)} or less to sell.`, 'error');
    }
    return;
  }

  const market = portfolio.assets[asset.symbol] || _createPracticeAssetState(asset);
  const salePrice = Number(market.price) || asset.basePrice;
  const saleAmount = _roundPortfolioNumber(quantity * salePrice, 2);
  if (saleAmount <= 0) return;

  const averageCost = ownedQuantity > 0
    ? _roundPortfolioNumber((Number(holding.totalCost) || 0) / ownedQuantity, 6)
    : 0;
  const costBasisSold = _roundPortfolioNumber(averageCost * quantity, 2);
  const remainingQuantity = _roundPortfolioNumber(ownedQuantity - quantity, 6);
  const remainingCost = _roundPortfolioNumber(Math.max(0, (Number(holding.totalCost) || 0) - costBasisSold), 2);

  if (remainingQuantity <= 0.0000005) {
    delete portfolio.holdings[asset.symbol];
  } else {
    portfolio.holdings[asset.symbol] = {
      ...holding,
      quantity: remainingQuantity,
      totalCost: remainingCost,
      lastSoldAt: new Date().toISOString()
    };
  }

  _portfolioShareSelections[symbol] = _getDefaultTradeQuantity(asset);
  S.cash = _roundPortfolioNumber((S.cash || 0) + saleAmount, 2);
  _recordPortfolioTrade('sell', asset, quantity, saleAmount, salePrice);
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  _renderActivePracticeStockDetailSheet();
  if (typeof renderMarket === 'function') renderMarket();
  if (typeof showToast === 'function') {
    showToast(`Sold ${_formatTradeQuantity(asset, quantity)} of ${asset.symbol} for ${_formatUsd(saleAmount, 2)}.`, 'success');
  }
}

function simulatePracticeMarketDay() {
  const { portfolio } = _ensurePracticePortfolio();
  // TEMP: Market requirements disabled for simulator development
  _refreshPracticeMarketPrices(true);
  _recordPracticePortfolioHistory();
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  save();
  if (typeof renderMarket === 'function') renderMarket();
  if (typeof showToast === 'function') {
    showToast('Simulated a new market day', 'success');
  }
  return portfolio;
}

function _openPortfolioSimulator() {
  _mFeatureId = 'portfolio-simulator';
  _portfolioQuoteStatus = '';
  _portfolioDetailSymbol = null;
  _portfolioDetailRange = '1D';
  _portfolioChartError = '';
  _openMarketModal();
  _renderPortfolioSimulatorModal();
  _startPracticePortfolioRefresh();
  refreshPracticePortfolioQuotes(false);
}


// ══════════════════════════════════════════════════════════════
// FINANCE DUELS PLACEHOLDER
// ══════════════════════════════════════════════════════════════

function _showFinanceDuelsPlaceholder() {
  if (typeof showAppModal !== 'function') return;
  showAppModal({
    icon:    'neutral',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.8">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>`,
    title:  'Financial Duels',
    body:   'Challenge friends to head-to-head finance knowledge battles — answer faster to win. This feature is coming soon for advanced players.',
    actions: [
      { label: 'Got it', cls: 'btn btn-primary', fn: closeAppModal }
    ]
  });
}


document.addEventListener('DOMContentLoaded', () => {
  // Close market modal when clicking outside the box
  const overlay = document.getElementById('marketModal');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) _closeMarketModal();
    });
  }
});
