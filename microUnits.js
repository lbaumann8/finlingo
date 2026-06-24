// FinLingo — canonical micro-lesson data model + preset units.
//
// One canonical shape for every unit (preset, AI-generated, or legacy):
//   unit    = { id, title, description, lessons:[lesson], recapQuiz:[question] }
//   lesson  = { id, title, slides:[slide], question }
//   slide   = { id, type, heading, body }
//   question= { prompt, choices:[..], correctAnswerIndex, explanation }
//
// `normalizeUnitToSlideFormat()` accepts new slide units and complete older
// micro-lesson units. It refuses truly incomplete lessons so they can be
// upgraded instead of silently fake-completed. Exposed as window.MicroData.

(function (global) {
  'use strict';

  function _slug(value) {
    return String(value || 'unit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'unit';
  }

  function _str(v) { return (v == null ? '' : String(v)).trim(); }

  function cleanGeneratedListItem(value) {
    return _str(value).replace(/^(?:[•●]\s*|[*]\s+|[-–—]\s+|\d+[.)]\s+)/, '').trim();
  }

  function normalizeQuestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const prompt = cleanGeneratedListItem(raw.prompt || raw.q || raw.question);
    let choices = raw.choices || raw.answers || raw.options || [];
    if (!Array.isArray(choices)) return null;
    const objChoices = choices.some(c => c && typeof c === 'object');
    const flat = choices.map(c => cleanGeneratedListItem(typeof c === 'string' ? c : (c && (c.text || c.label || c.choice)))).filter(Boolean);
    if (!prompt || flat.length !== 4) return null;

    let ci = raw.correctAnswerIndex;
    if (!Number.isInteger(ci)) ci = raw.correct_index;
    if (!Number.isInteger(ci) && objChoices) ci = choices.findIndex(c => c && c.correct);
    if (!Number.isInteger(ci) && raw.answer != null) {
      ci = flat.findIndex(c => c.toLowerCase() === _str(raw.answer).toLowerCase());
    }
    if (!Number.isInteger(ci) || ci < 0 || ci >= flat.length) ci = 0;

    return {
      prompt: prompt,
      choices: flat.slice(0, 4),
      correctAnswerIndex: Math.min(ci, Math.min(flat.length, 4) - 1),
      explanation: cleanGeneratedListItem(raw.explanation || raw.feedback)
    };
  }

  function _slide(raw, fallbackType, fallbackHeading, i) {
    if (!raw || typeof raw !== 'object') return null;
    const body = cleanGeneratedListItem(raw.body || raw.text || raw.content || raw.description);
    if (!body) return null;
    const type = _str(raw.type || fallbackType || 'concept').toLowerCase();
    const heading = cleanGeneratedListItem(raw.heading || raw.title || fallbackHeading || (type === 'takeaway' ? 'Key details' : 'The basic idea'));
    return {
      id: _str(raw.id) || ('slide_' + (i + 1)),
      type: ['concept', 'example', 'takeaway', 'comparison', 'process'].includes(type) ? type : 'concept',
      heading: heading,
      body: body
    };
  }

  function _slidesFromLegacyFields(raw) {
    const slides = [];
    const coreIdea = cleanGeneratedListItem(raw.coreIdea || raw.core_idea || raw.content || raw.summary);
    const example = cleanGeneratedListItem(raw.example || raw.simpleExample || raw.simple_example);
    const takeaway = cleanGeneratedListItem(raw.takeaway || raw.remember || raw.keyTakeaway || raw.key_takeaway);
    if (coreIdea) slides.push({ id: 'slide_1', type: 'concept', heading: 'The basic idea', body: coreIdea });
    if (example) slides.push({ id: 'slide_2', type: 'example', heading: 'See it in action', body: example });
    if (takeaway) slides.push({ id: 'slide_' + (slides.length + 1), type: 'takeaway', heading: 'Key details', body: takeaway });
    return slides;
  }

  function normalizeLesson(raw, i) {
    raw = raw || {};
    const title = cleanGeneratedListItem(raw.title || raw.name) || ('Lesson ' + (i + 1));
    let slides = Array.isArray(raw.slides)
      ? raw.slides.map((s, si) => _slide(s, null, null, si)).filter(Boolean)
      : [];
    if (!slides.length) slides = _slidesFromLegacyFields(raw);
    slides = slides.slice(0, 4).map((s, si) => ({
      id: _str(s.id) || ('slide_' + (si + 1)),
      type: s.type,
      heading: s.type === 'takeaway' ? 'Key details' : (cleanGeneratedListItem(s.heading) || 'The basic idea'),
      body: cleanGeneratedListItem(s.body)
    }));
    const question = normalizeQuestion(raw.question || raw.quickCheck || (Array.isArray(raw.questions) ? raw.questions[0] : null));
    return {
      id: _str(raw.id) || ('lesson_' + _slug(title) + '_' + i),
      title: title,
      slides: slides,
      // Backward-compatible fields for previews and older helper calls only.
      coreIdea: slides.find(s => s.type === 'concept')?.body || '',
      example: slides.find(s => s.type === 'example' || s.type === 'process' || s.type === 'comparison')?.body || '',
      takeaway: slides.find(s => s.type === 'takeaway')?.body || '',
      question: question
    };
  }

  function normalizeUnitToSlideFormat(raw) {
    raw = raw || {};
    const lessons = (Array.isArray(raw.lessons) ? raw.lessons : []).map(normalizeLesson);
    let recap = raw.recapQuiz || raw.recap_quiz || raw.recap || [];
    recap = (Array.isArray(recap) ? recap : []).map(normalizeQuestion).filter(Boolean);
    // Backfill a recap from lesson quick-checks if the source lacked one.
    if (recap.length < 3) {
      const pool = lessons.map(l => l.question).filter(Boolean);
      for (let k = 0; k < pool.length && recap.length < 3; k++) {
        if (recap.indexOf(pool[k]) === -1) recap.push(pool[k]);
      }
    }
    const title = cleanGeneratedListItem(raw.title || raw.unitTitle || raw.unit_title) || 'Unit';
    return {
      id: _str(raw.id) || ('unit_' + _slug(title)),
      title: title,
      description: cleanGeneratedListItem(raw.description || raw.unitDescription || raw.unit_description),
      lessons: lessons,
      recapQuiz: recap.slice(0, 3),
      selectedDepth: _str(raw.selectedDepth || raw.selected_depth),
      topicScope: _str(raw.topicScope || raw.topic_scope),
      requestedLessonRange: raw.requestedLessonRange || raw.requested_lesson_range || null,
      actualLessonCount: Number(raw.actualLessonCount || raw.actual_lesson_count || lessons.length) || lessons.length,
      source: raw.source || 'preset'
    };
  }

  const normalizeUnit = normalizeUnitToSlideFormat;

  // ── Authored preset micro-units ─────────────────────────────────────
  // Hand-written to the micro-lesson spec: one idea per lesson, 60–90s each,
  // a four-choice quick check, and a three-question recap. Beginner language.
  const MICRO_UNITS = [
    {
      id: 'unit_stock_market_basics',
      title: 'Stock Market Basics',
      description: 'What a stock is, why prices move, and how everyday investors take part.',
      lessons: [
        {
          title: 'What Is a Stock?',
          coreIdea: 'A stock is a small piece of ownership in a company. When you own a stock, you own a tiny share of that business and can benefit if it grows.',
          example: 'If you buy one share of a company with a million shares, you own one-millionth of it.',
          takeaway: 'A stock means you own a small slice of a real company.',
          question: {
            prompt: 'What does owning a stock give you?',
            choices: ['A small share of ownership in a company', 'A loan you must repay the company', 'A guaranteed yearly payment', 'A seat on the board of directors'],
            correctAnswerIndex: 0,
            explanation: 'Owning a stock makes you a part-owner of the company.'
          }
        },
        {
          title: 'What Is the Stock Market?',
          coreIdea: 'The stock market is where people buy and sell shares of companies. It connects investors who want to buy with those who want to sell.',
          example: 'When you buy a share through an app, the market matches you with someone selling that same share.',
          takeaway: 'The stock market is a marketplace for buying and selling company shares.',
          question: {
            prompt: 'What mainly happens in the stock market?',
            choices: ['Companies print new money', 'People buy and sell company shares', 'Banks set interest rates', 'Governments collect taxes'],
            correctAnswerIndex: 1,
            explanation: 'The market is where shares change hands between buyers and sellers.'
          }
        },
        {
          title: 'Why Stock Prices Move',
          coreIdea: 'A stock’s price changes based on supply and demand. When more people want to buy than sell, the price rises; when more want to sell, it falls.',
          example: 'Good news about a company can make more people want its shares, pushing the price up.',
          takeaway: 'Prices move when buyer and seller demand shifts.',
          question: {
            prompt: 'A stock price usually rises when…',
            choices: ['More people want to sell it', 'The company stops making products', 'More people want to buy it', 'Nothing is happening'],
            correctAnswerIndex: 2,
            explanation: 'Stronger buying demand pushes a price higher.'
          }
        },
        {
          title: 'What Is a Dividend?',
          coreIdea: 'A dividend is a share of a company’s profits paid out to shareholders. Not every company pays one, but those that do usually pay on a regular schedule.',
          example: 'A company might pay $0.50 per share every few months to people who own its stock.',
          takeaway: 'A dividend is profit a company hands back to its shareholders.',
          question: {
            prompt: 'A dividend is best described as…',
            choices: ['A fee you pay to own a stock', 'A share of company profits paid to owners', 'A loan from the company', 'A tax on investing'],
            correctAnswerIndex: 1,
            explanation: 'Dividends pass part of a company’s profit to its shareholders.'
          }
        },
        {
          title: 'What Is an Index Fund?',
          coreIdea: 'An index fund holds many stocks at once to track a whole slice of the market. Buying one share spreads your money across all those companies.',
          example: 'An S&P 500 index fund holds about 500 large U.S. companies in a single investment.',
          takeaway: 'An index fund lets you own a broad basket of stocks in one buy.',
          question: {
            prompt: 'Why do many beginners like index funds?',
            choices: ['They guarantee profits', 'They track a single hot stock', 'They spread money across many companies at once', 'They avoid the stock market entirely'],
            correctAnswerIndex: 2,
            explanation: 'One index fund gives instant diversification across many companies.'
          }
        }
      ],
      recapQuiz: [
        {
          prompt: 'Owning shares of a company makes you…',
          choices: ['A part-owner of the business', 'A lender to the business', 'An employee of the business', 'A customer only'],
          correctAnswerIndex: 0,
          explanation: 'Shares represent ownership in the company.'
        },
        {
          prompt: 'What causes a stock’s price to rise?',
          choices: ['Weaker demand to buy', 'Stronger demand to buy', 'Paying a dividend', 'Closing the market'],
          correctAnswerIndex: 1,
          explanation: 'More buying demand than selling pushes prices up.'
        },
        {
          prompt: 'An index fund mainly helps you…',
          choices: ['Bet on one company', 'Own many companies at once', 'Avoid all risk', 'Earn guaranteed returns'],
          correctAnswerIndex: 1,
          explanation: 'Index funds spread your money across many holdings.'
        }
      ]
    },
    {
      id: 'unit_investing_foundations',
      title: 'Investing Foundations',
      description: 'Core habits that help everyday investors grow money over time.',
      lessons: [
        {
          title: 'What Is an ETF?',
          coreIdea: 'An ETF, or exchange-traded fund, bundles many investments into one product you can buy and sell like a stock. It lets you own a mix of assets in a single purchase.',
          example: 'One ETF share might hold hundreds of different company stocks at once.',
          takeaway: 'An ETF is a basket of investments you can trade like a single stock.',
          question: {
            prompt: 'What is an ETF?',
            choices: ['A single company’s stock', 'A basket of investments traded like a stock', 'A type of savings account', 'A short-term loan'],
            correctAnswerIndex: 1,
            explanation: 'An ETF holds many assets but trades as one product.'
          }
        },
        {
          title: 'Diversification',
          coreIdea: 'Diversification means spreading your money across many investments instead of one. If one does poorly, the others can cushion the loss.',
          example: 'Owning 100 companies means one failing company can’t sink your whole portfolio.',
          takeaway: 'Diversification lowers the risk of any single investment hurting you.',
          question: {
            prompt: 'Diversification mainly protects you from…',
            choices: ['Ever losing any money', 'One investment sinking everything', 'Paying any fees', 'Market holidays'],
            correctAnswerIndex: 1,
            explanation: 'Spreading out means no single loss can wipe you out.'
          }
        },
        {
          title: 'Compound Interest',
          coreIdea: 'Compound interest is earning returns on your past returns, not just your original money. Over time, this makes growth speed up.',
          example: '$1,000 growing at 8% a year becomes about $2,160 in ten years without adding a cent.',
          takeaway: 'Compounding means your money can grow on its own growth.',
          question: {
            prompt: 'Compound interest means you earn returns on…',
            choices: ['Only your original deposit', 'Your deposit plus past returns', 'Only this year’s deposit', 'Nothing until you sell'],
            correctAnswerIndex: 1,
            explanation: 'Returns build on earlier returns, so growth accelerates.'
          }
        },
        {
          title: 'Risk vs. Reward',
          coreIdea: 'Investments that can earn more usually carry more risk of loss. Lower-risk choices tend to grow more slowly but steadily.',
          example: 'A savings account is very safe but grows slowly, while stocks can grow faster but rise and fall.',
          takeaway: 'Higher potential reward usually comes with higher risk.',
          question: {
            prompt: 'In general, higher potential returns come with…',
            choices: ['Lower risk', 'No risk', 'Higher risk', 'Guaranteed safety'],
            correctAnswerIndex: 2,
            explanation: 'Bigger possible gains usually mean bigger possible swings.'
          }
        },
        {
          title: 'Time in the Market',
          coreIdea: 'Staying invested over many years usually beats trying to guess the perfect moment to buy or sell. Time lets compounding and recoveries work for you.',
          example: 'Investing a set amount every month avoids the trap of waiting for a “perfect” day.',
          takeaway: 'Time in the market tends to beat timing the market.',
          question: {
            prompt: 'For most beginners, what tends to work best?',
            choices: ['Guessing the exact bottom', 'Staying invested over time', 'Trading every day', 'Waiting in cash for years'],
            correctAnswerIndex: 1,
            explanation: 'Steady, long-term investing usually beats trying to time moves.'
          }
        }
      ],
      recapQuiz: [
        {
          prompt: 'An ETF is best described as…',
          choices: ['One company’s stock', 'A basket of investments', 'A bank loan', 'A tax form'],
          correctAnswerIndex: 1,
          explanation: 'An ETF bundles many investments into one tradable product.'
        },
        {
          prompt: 'Compounding is powerful because…',
          choices: ['Returns build on past returns', 'It removes all risk', 'It pays daily', 'It avoids taxes'],
          correctAnswerIndex: 0,
          explanation: 'Earning returns on returns makes growth speed up.'
        },
        {
          prompt: 'Spreading money across many investments is called…',
          choices: ['Timing', 'Diversification', 'Leverage', 'Compounding'],
          correctAnswerIndex: 1,
          explanation: 'Diversification reduces single-investment risk.'
        }
      ]
    },
    {
      id: 'unit_companies_and_ipos',
      title: 'Companies & IPOs',
      description: 'How companies raise money and become publicly traded.',
      lessons: [
        {
          title: 'What Is an IPO?',
          coreIdea: 'An IPO is when a private company sells shares to the public for the first time. It lets the company raise money and lets regular investors buy ownership.',
          example: 'A company might use IPO money to open new locations or develop new products.',
          takeaway: 'An IPO is when a private company becomes publicly traded.',
          question: {
            prompt: 'Why might a company launch an IPO?',
            choices: ['To raise money from investors', 'To stop selling products', 'To close the business', 'To avoid public ownership'],
            correctAnswerIndex: 0,
            explanation: 'Companies use IPOs to raise money by selling ownership shares.'
          }
        },
        {
          title: 'Why Companies Go Public',
          coreIdea: 'Going public gives a company access to money from many investors at once. In return, it must share financial details and answer to shareholders.',
          example: 'A growing company may go public to fund expansion faster than borrowing alone allows.',
          takeaway: 'Companies go public mainly to raise money for growth.',
          question: {
            prompt: 'A trade-off of going public is that a company must…',
            choices: ['Stop making profits', 'Share financial information openly', 'Give away all its shares', 'Leave the stock market'],
            correctAnswerIndex: 1,
            explanation: 'Public companies must disclose financials to shareholders.'
          }
        },
        {
          title: 'What Is Market Cap?',
          coreIdea: 'Market cap is the total value of a company’s shares. You find it by multiplying the share price by the number of shares.',
          example: 'A company with 1 million shares priced at $10 each has a $10 million market cap.',
          takeaway: 'Market cap measures a company’s total share value.',
          question: {
            prompt: 'How is market cap calculated?',
            choices: ['Share price × number of shares', 'Profit ÷ employees', 'Revenue − costs', 'Shares ÷ price'],
            correctAnswerIndex: 0,
            explanation: 'Market cap is share price multiplied by total shares.'
          }
        },
        {
          title: 'Shares and Ownership',
          coreIdea: 'The more shares you own, the bigger your slice of the company. Owning shares can give you a claim on profits and sometimes voting rights.',
          example: 'Owning 100 shares gives you ten times the stake of owning 10 shares.',
          takeaway: 'More shares means a larger ownership stake.',
          question: {
            prompt: 'Owning more shares of a company means…',
            choices: ['A smaller ownership stake', 'A larger ownership stake', 'You owe the company money', 'Nothing changes'],
            correctAnswerIndex: 1,
            explanation: 'Each share is a slice of ownership, so more shares means more ownership.'
          }
        },
        {
          title: 'Earnings Basics',
          coreIdea: 'Earnings are the profit a company makes after costs. Companies report earnings regularly, and strong earnings often support a higher share price.',
          example: 'If a company earns more than investors expected, its stock often rises.',
          takeaway: 'Earnings show how much profit a company is actually making.',
          question: {
            prompt: 'A company’s earnings are its…',
            choices: ['Total sales before costs', 'Profit after costs', 'Number of shares', 'Stock price'],
            correctAnswerIndex: 1,
            explanation: 'Earnings are what’s left after a company pays its costs.'
          }
        }
      ],
      recapQuiz: [
        {
          prompt: 'An IPO is the moment a company…',
          choices: ['Sells shares to the public for the first time', 'Closes down', 'Stops paying taxes', 'Buys another company'],
          correctAnswerIndex: 0,
          explanation: 'An IPO is a private company’s first public share sale.'
        },
        {
          prompt: 'Market cap equals…',
          choices: ['Revenue minus costs', 'Share price times shares', 'Profit per employee', 'Shares divided by price'],
          correctAnswerIndex: 1,
          explanation: 'Market cap is share price multiplied by number of shares.'
        },
        {
          prompt: 'Strong earnings often lead to…',
          choices: ['A lower share price', 'A higher share price', 'Fewer shares', 'An IPO'],
          correctAnswerIndex: 1,
          explanation: 'Better-than-expected profit tends to lift a stock.'
        }
      ]
    },
    {
      id: 'unit_money_and_inflation',
      title: 'Money & Inflation',
      description: 'How inflation, bonds, and interest rates shape everyday money.',
      lessons: [
        {
          title: 'What Is Inflation?',
          coreIdea: 'Inflation is the gradual rise in prices over time. As prices climb, each dollar buys a little less than it used to.',
          example: 'If a coffee costs $3 today and $3.15 next year, that increase is inflation.',
          takeaway: 'Inflation slowly reduces what each dollar can buy.',
          question: {
            prompt: 'Inflation describes…',
            choices: ['Prices rising over time', 'The stock market falling', 'A type of bond', 'A bank fee'],
            correctAnswerIndex: 0,
            explanation: 'Inflation is the general rise in prices over time.'
          }
        },
        {
          title: 'Inflation and Savings',
          coreIdea: 'If your savings grow slower than inflation, your money loses buying power. That’s why cash sitting idle can quietly shrink in value.',
          example: 'Money earning 1% while prices rise 3% loses about 2% of its buying power that year.',
          takeaway: 'Money must grow at least as fast as inflation to keep its value.',
          question: {
            prompt: 'Why can idle cash lose value over time?',
            choices: ['Banks delete money', 'Inflation reduces its buying power', 'It earns too much interest', 'Cash expires'],
            correctAnswerIndex: 1,
            explanation: 'If prices rise faster than your money grows, it buys less.'
          }
        },
        {
          title: 'What Is a Bond?',
          coreIdea: 'A bond is a loan you give to a company or government. In return, they pay you interest and return your money on a set date.',
          example: 'Buying a $1,000 bond might pay you interest each year until it’s repaid.',
          takeaway: 'A bond is a loan that pays you interest over time.',
          question: {
            prompt: 'When you buy a bond, you are…',
            choices: ['Buying ownership in a company', 'Lending money for interest', 'Paying a tax', 'Buying a stock'],
            correctAnswerIndex: 1,
            explanation: 'A bond is a loan that pays you interest and returns your principal.'
          }
        },
        {
          title: 'Interest Rates Basics',
          coreIdea: 'Interest rates are the cost of borrowing money. When rates rise, loans get more expensive and saving can earn a bit more.',
          example: 'A higher rate makes a car loan cost more each month.',
          takeaway: 'Interest rates set how expensive borrowing is.',
          question: {
            prompt: 'When interest rates rise, borrowing money becomes…',
            choices: ['Cheaper', 'More expensive', 'Free', 'Impossible'],
            correctAnswerIndex: 1,
            explanation: 'Higher rates raise the cost of loans.'
          }
        },
        {
          title: 'Emergency Fund Basics',
          coreIdea: 'An emergency fund is cash set aside for surprise costs, like a car repair or lost income. It keeps you from borrowing during a crunch.',
          example: 'Saving a few months of expenses helps you handle an unexpected bill without debt.',
          takeaway: 'An emergency fund is a cash cushion for surprises.',
          question: {
            prompt: 'The main purpose of an emergency fund is to…',
            choices: ['Earn the highest returns', 'Cover surprise costs without debt', 'Buy stocks quickly', 'Avoid all saving'],
            correctAnswerIndex: 1,
            explanation: 'It’s a safety cushion for unexpected expenses.'
          }
        }
      ],
      recapQuiz: [
        {
          prompt: 'Inflation means that over time…',
          choices: ['Each dollar buys less', 'Each dollar buys more', 'Prices never change', 'Banks lose money'],
          correctAnswerIndex: 0,
          explanation: 'Inflation slowly lowers the buying power of money.'
        },
        {
          prompt: 'Buying a bond means you are…',
          choices: ['Lending money for interest', 'Buying company ownership', 'Paying a fee', 'Opening a checking account'],
          correctAnswerIndex: 0,
          explanation: 'A bond is a loan that pays you interest.'
        },
        {
          prompt: 'An emergency fund mainly helps you…',
          choices: ['Chase high returns', 'Handle surprise costs without borrowing', 'Avoid investing forever', 'Time the market'],
          correctAnswerIndex: 1,
          explanation: 'It’s a cash cushion that prevents debt during surprises.'
        }
      ]
    }
  ];

  const _presetById = {};
  MICRO_UNITS.forEach(u => { _presetById[u.id] = u; });

  // Map the first two ORIGINAL curriculum units (UNITS_DEF ids 1 & 2) to
  // authored micro-lessons, WITHOUT replacing the original unit objects: the
  // unit keeps its real id/title/description/order; only its lesson CONTENT is
  // provided here. Stable micro id `preset_unit_<n>` keys progress.
  const PRESET_MICRO_SOURCE = {
    1: MICRO_UNITS[0], // → "Money & Markets"
    2: MICRO_UNITS[1]  // → "Investing for Everyone"
  };

  function _originalUnit(unitId) {
    const defs = global.UNITS_DEF || (typeof UNITS_DEF !== 'undefined' ? UNITS_DEF : []);
    return Array.isArray(defs) ? defs.find(u => Number(u.id) === Number(unitId)) : null;
  }

  function presetUnitHasMicro(unitId) { return !!PRESET_MICRO_SOURCE[Number(unitId)]; }

  // Returns a NORMALIZED micro-unit carrying the original unit's identity.
  // Never mutates the original unit or the lesson source (normalizeUnit copies).
  function getPresetMicroUnitByUnitId(unitId) {
    const src = PRESET_MICRO_SOURCE[Number(unitId)];
    if (!src) return null;
    const orig = _originalUnit(unitId) || {};
    return normalizeUnit({
      id: 'preset_unit_' + Number(unitId),
      presetUnitId: Number(unitId),
      title: orig.title || orig.name || src.title,
      description: orig.description || src.description,
      icon: orig.icon || '',
      lessons: src.lessons,
      recapQuiz: src.recapQuiz,
      source: 'preset'
    });
  }

  function getMicroUnit(id) {
    const m = /^preset_unit_(\d+)$/.exec(String(id || ''));
    if (m) return getPresetMicroUnitByUnitId(Number(m[1]));
    if (_presetById[id]) return normalizeUnit(_presetById[id]);
    if (global.CoachUnits && typeof global.CoachUnits.get === 'function') {
      const saved = global.CoachUnits.get(id);
      if (saved) return normalizeUnit(saved);
    }
    return null;
  }

  function presetUnits() {
    return [1, 2].map(getPresetMicroUnitByUnitId).filter(Boolean);
  }

  // Validate a NORMALIZED unit. `ok` gates whether it can be played as-is:
  // every lesson needs 2-4 real slides, a four-choice quick check, and the
  // unit needs a complete 3-question recap. Use this to route incomplete units
  // to an upgrade instead of opening a broken lesson.
  function validateUnit(unit) {
    const reasons = [];
    const lessons = (unit && Array.isArray(unit.lessons)) ? unit.lessons : [];
    if (!lessons.length) reasons.push('no lessons');
    let allLessonsValid = lessons.length > 0;
    lessons.forEach((l, i) => {
      const n = i + 1;
      if (!_str(l.title)) reasons.push('lesson ' + n + ' missing title');
      const slides = Array.isArray(l.slides) ? l.slides : [];
      if (slides.length < 2 || slides.length > 4) {
        reasons.push('lesson ' + n + ' needs 2-4 slides');
        allLessonsValid = false;
      }
      slides.forEach((s, si) => {
        if (!_str(s.body)) {
          reasons.push('lesson ' + n + ' slide ' + (si + 1) + ' missing body');
          allLessonsValid = false;
        }
      });
      if (!slides.some(s => s.type === 'concept')) {
        reasons.push('lesson ' + n + ' missing concept slide');
        allLessonsValid = false;
      }
      if (!slides.some(s => ['example', 'process', 'comparison', 'takeaway'].includes(s.type))) {
        reasons.push('lesson ' + n + ' missing supporting slide');
        allLessonsValid = false;
      }
      const q = l.question;
      if (!q) { reasons.push('lesson ' + n + ' missing question'); allLessonsValid = false; return; }
      if (!_str(q.prompt)) reasons.push('lesson ' + n + ' question missing prompt');
      if (!Array.isArray(q.choices) || q.choices.length !== 4) { reasons.push('lesson ' + n + ' needs exactly 4 choices'); allLessonsValid = false; }
      if (!(Number.isInteger(q.correctAnswerIndex) && q.correctAnswerIndex >= 0 && q.correctAnswerIndex <= 3)) { reasons.push('lesson ' + n + ' bad correctAnswerIndex'); allLessonsValid = false; }
      if (!_str(q.explanation)) { reasons.push('lesson ' + n + ' question missing explanation'); allLessonsValid = false; }
    });
    const recap = (unit && Array.isArray(unit.recapQuiz)) ? unit.recapQuiz : [];
    const recapOk = recap.length === 3 && recap.every(q => q && _str(q.prompt) && Array.isArray(q.choices) && q.choices.length === 4 && Number.isInteger(q.correctAnswerIndex) && q.correctAnswerIndex >= 0 && q.correctAnswerIndex <= 3 && _str(q.explanation));
    if (!recapOk) reasons.push('recap quiz needs 3 complete questions');
    return { ok: allLessonsValid && recapOk && lessons.length > 0, playable: allLessonsValid && lessons.length > 0, reasons };
  }

  global.MicroData = {
    MICRO_UNITS: MICRO_UNITS,
    cleanGeneratedListItem: cleanGeneratedListItem,
    normalizeUnitToSlideFormat: normalizeUnitToSlideFormat,
    normalizeUnit: normalizeUnit,
    normalizeLesson: normalizeLesson,
    normalizeQuestion: normalizeQuestion,
    getMicroUnit: getMicroUnit,
    presetUnits: presetUnits,
    presetUnitHasMicro: presetUnitHasMicro,
    getPresetMicroUnitByUnitId: getPresetMicroUnitByUnitId,
    validateUnit: validateUnit
  };
})(typeof window !== 'undefined' ? window : this);
