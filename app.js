/*
 * Lucky 777 Casino Hub — 共用前端邏輯
 * 設計原則：IIFE 封裝、模組化、零第三方相依、FSM 防止重複下注。
 * 注意：這是「示範用」前端 RNG 與賠率；正式商用必須將 RNG / RTP / 派彩移到伺服器端。
 */
(function () {
  'use strict';

  // ============================================================
  // 常數與全域狀態
  // ============================================================
  var START_CREDITS = 1000;
  var MAX_BET = 100;
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RED_SUITS = { '♥': true, '♦': true };
  var RED_NUMBERS = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1,
                      19: 1, 21: 1, 23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };

  var App = {
    credits: START_CREDITS,
    bet: 10,
    active: 'slots',
    busy: false
  };

  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) { return n.toLocaleString('zh-Hant'); }

  function updateBalance() {
    $('balance').textContent = fmt(App.credits);
  }

  function announce(id, message, kind) {
    var el = $(id);
    el.textContent = message;
    el.className = 'result' + (kind ? ' is-' + kind : '');
  }

  // ============================================================
  // RNG：前端加權隨機數（示範用）
  // ============================================================
  var RNG = {
    int: function (min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    pick: function (arr) {
      return arr[this.int(0, arr.length - 1)];
    },
    weighted: function (items) {
      var total = 0, i;
      for (i = 0; i < items.length; i++) { total += items[i].weight; }
      var r = Math.random() * total;
      for (i = 0; i < items.length; i++) {
        r -= items[i].weight;
        if (r <= 0) { return items[i]; }
      }
      return items[items.length - 1];
    },
    shuffle: function (deck) {
      for (var i = deck.length - 1; i > 0; i--) {
        var j = this.int(0, i);
        var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
      }
      return deck;
    }
  };

  function makeDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        deck.push({ rank: RANKS[r], suit: SUITS[s] });
      }
    }
    return RNG.shuffle(deck);
  }

  function cardValue(rank) {
    var idx = RANKS.indexOf(rank) + 2; // 2..14
    return idx;
  }

  function cardText(card) { return card.rank + card.suit; }

  function renderCard(card, hidden) {
    var el = document.createElement('span');
    el.className = 'card' + (hidden ? ' is-hidden' : '') + (RED_SUITS[card.suit] ? ' red' : '');
    el.textContent = hidden ? '🂠' : cardText(card);
    return el;
  }

  function renderCards(container, cards, hiddenIndex) {
    container.innerHTML = '';
    for (var i = 0; i < cards.length; i++) {
      container.appendChild(renderCard(cards[i], i === hiddenIndex));
    }
  }

  function blackjackValue(cards) {
    var sum = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      var v = cardValue(cards[i].rank);
      if (v > 10) { v = 10; }
      if (cards[i].rank === 'A') { aces++; v = 11; }
      sum += v;
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
  }

  function baccaratCardValue(card) {
    if (card.rank === 'A') { return 1; }
    if (['10', 'J', 'Q', 'K'].indexOf(card.rank) >= 0) { return 0; }
    return parseInt(card.rank, 10);
  }

  function baccaratScore(cards) {
    var sum = 0;
    for (var i = 0; i < cards.length; i++) { sum += baccaratCardValue(cards[i]); }
    return sum % 10;
  }

  // ============================================================
  // 下注與派彩
  // ============================================================
  function readBet() {
    var value = parseInt($('bet-amount').value, 10);
    if (isNaN(value) || value < 1) { value = 1; }
    if (value > MAX_BET) { value = MAX_BET; }
    $('bet-amount').value = value;
    App.bet = value;
    return value;
  }

  function placeBet(extra) {
    if (App.busy) { return false; }
    readBet();
    var amount = App.bet + (extra || 0);
    if (App.credits < amount) {
      window.alert('試玩籌碼不足，請重置籌碼。');
      return false;
    }
    App.credits -= amount;
    updateBalance();
    return true;
  }

  function payout(multiplier, targetId) {
    var amount = Math.round(App.bet * multiplier);
    App.credits += amount;
    updateBalance();
    return amount;
  }

  // ============================================================
  // 分頁切換
  // ============================================================
  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (other) {
          var selected = other === tab;
          other.classList.toggle('is-active', selected);
          other.setAttribute('aria-selected', selected ? 'true' : 'false');
          other.tabIndex = selected ? 0 : -1;
          var panel = $(other.getAttribute('aria-controls'));
          panel.hidden = !selected;
          panel.classList.toggle('is-active', selected);
        });
        App.active = tab.dataset.game;
      });
      tab.addEventListener('keydown', function (event) {
        var delta = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
        if (!delta) { return; }
        event.preventDefault();
        var next = tabs[(index + delta + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });
    });
  }

  // ============================================================
  // 遊戲一：幸運 777 老虎機
  // ============================================================
  var Slots = (function () {
    var SYMBOLS = [
      { id: 'cherry', glyph: '🍒', name: '櫻桃', weight: 30, pay3: 3, pay2: 1 },
      { id: 'lemon',  glyph: '🍋', name: '檸檬', weight: 18, pay3: 5, pay2: 0 },
      { id: 'diamond',glyph: '💎', name: '鑽石', weight: 8,  pay3: 10, pay2: 0 },
      { id: 'seven',  glyph: '7️⃣', name: '幸運七', weight: 5, pay3: 20, pay2: 0 }
    ];
    var reels = [$('reel-0'), $('reel-1'), $('reel-2')];

    function spin() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      App.busy = true;
      $('slots-spin').disabled = true;
      announce('slots-result', '旋轉中…');
      reels.forEach(function (reel) { reel.classList.add('is-spinning'); });

      window.setTimeout(function () {
        var picked = [RNG.weighted(SYMBOLS), RNG.weighted(SYMBOLS), RNG.weighted(SYMBOLS)];
        reels.forEach(function (reel, i) {
          reel.classList.remove('is-spinning');
          reel.querySelector('span').textContent = picked[i].glyph;
        });

        var win = 0, label = '';
        if (picked[0].id === picked[1].id && picked[1].id === picked[2].id) {
          win = picked[0].pay3;
          label = '三個' + picked[0].name + '！';
        } else if (picked[0].id === 'cherry' && picked[1].id === 'cherry') {
          win = 1;
          label = '兩個櫻桃！';
        }
        if (win > 0) {
          var amount = payout(win);
          announce('slots-result', label + ' 派彩 ' + fmt(amount) + ' 籌碼。', 'win');
        } else {
          announce('slots-result', '未中獎，再試一次。', 'lose');
        }
        App.busy = false;
        $('slots-spin').disabled = false;
      }, 900);
    }

    return { init: function () { $('slots-spin').addEventListener('click', spin); } };
  })();

  // ============================================================
  // 遊戲二：影像撲克
  // ============================================================
  var VideoPoker = (function () {
    var cards = [], held = [false, false, false, false, false], deck = [], phase = 'idle';

    function evaluate(hand) {
      var ranks = hand.map(function (c) { return cardValue(c.rank); });
      var suits = hand.map(function (c) { return c.suit; });
      var counts = {};
      ranks.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
      var groups = Object.keys(counts).map(function (r) {
        return { rank: parseInt(r, 10), count: counts[r] };
      }).sort(function (a, b) { return b.count - a.count || b.rank - a.rank; });
      var unique = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
      var isFlush = suits.every(function (s) { return s === suits[0]; });
      var isStraight = unique.length === 5 && unique[4] - unique[0] === 4;
      var isWheel = unique.length === 5 && unique[0] === 2 && unique[4] === 14;

      if (isFlush && (isStraight || isWheel) && unique[4] === 14) {
        return { name: '同花大順', mult: 250 };
      }
      if (isFlush && (isStraight || isWheel)) { return { name: '同花順', mult: 50 }; }
      if (groups[0].count === 4) { return { name: '四條', mult: 25 }; }
      if (groups[0].count === 3 && groups[1].count === 2) { return { name: '葫蘆', mult: 9 }; }
      if (isFlush) { return { name: '同花', mult: 6 }; }
      if (isStraight || isWheel) { return { name: '順子', mult: 4 }; }
      if (groups[0].count === 3) { return { name: '三條', mult: 3 }; }
      if (groups[0].count === 2 && groups[1].count === 2) { return { name: '兩對', mult: 2 }; }
      if (groups[0].count === 2 && groups[0].rank >= 11) {
        return { name: 'Jacks 或更好', mult: 1 };
      }
      return { name: '未成牌型', mult: 0 };
    }

    function render() {
      var container = $('vp-cards');
      container.innerHTML = '';
      cards.forEach(function (card, i) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'card' + (held[i] ? ' is-held' : '') + (RED_SUITS[card.suit] ? ' red' : '');
        button.textContent = cardText(card);
        button.setAttribute('aria-pressed', held[i] ? 'true' : 'false');
        button.setAttribute('aria-label', '第 ' + (i + 1) + ' 張 ' + cardText(card) + (held[i] ? '，已保留' : ''));
        button.disabled = phase !== 'draw';
        button.addEventListener('click', function () {
          held[i] = !held[i];
          render();
        });
        container.appendChild(button);
      });
    }

    function deal() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      deck = makeDeck();
      cards = deck.splice(0, 5);
      held = [false, false, false, false, false];
      phase = 'draw';
      render();
      $('vp-deal').disabled = true;
      $('vp-draw').disabled = false;
      announce('vp-result', '選取要保留的牌，然後按「換牌」。');
    }

    function draw() {
      if (phase !== 'draw' || App.busy) { return; }
      App.busy = true;
      for (var i = 0; i < 5; i++) {
        if (!held[i]) { cards[i] = deck.shift(); }
      }
      phase = 'idle';
      render();
      $('vp-deal').disabled = false;
      $('vp-draw').disabled = true;
      var result = evaluate(cards);
      if (result.mult > 0) {
        var amount = payout(result.mult);
        announce('vp-result', result.name + '！派彩 ' + fmt(amount) + ' 籌碼。', 'win');
      } else {
        announce('vp-result', result.name + '，未派彩。', 'lose');
      }
      App.busy = false;
    }

    return {
      init: function () {
        $('vp-deal').addEventListener('click', deal);
        $('vp-draw').addEventListener('click', draw);
        render();
      }
    };
  })();

  // ============================================================
  // 遊戲三：21 點 Blackjack
  // ============================================================
  var Blackjack = (function () {
    var deck = [], player = [], dealer = [], doubled = false;

    function setButtons(dealing) {
      $('bj-deal').disabled = dealing;
      $('bj-hit').disabled = !dealing;
      $('bj-stand').disabled = !dealing;
      $('bj-double').disabled = !dealing || App.credits < App.bet;
    }

    function render(hideDealer) {
      renderCards($('bj-player'), player, -1);
      renderCards($('bj-dealer'), dealer, hideDealer ? 1 : -1);
    }

    function dealerPlay() {
      render(false);
      var total = blackjackValue(dealer);
      while (total < 17) {
        dealer.push(deck.shift());
        total = blackjackValue(dealer);
      }
      var playerTotal = blackjackValue(player);
      var message;
      if (playerTotal > 21) {
        message = '玩家爆牌，莊家獲勝。';
      } else if (total > 21 || playerTotal > total) {
        var amount = payout(doubled ? 4 : 2);
        message = '玩家獲勝！派彩 ' + fmt(amount) + ' 籌碼。';
        announce('bj-result', message, 'win');
      } else if (playerTotal === total) {
        payout(doubled ? 2 : 1);
        announce('bj-result', '平局，返還下注。');
      } else {
        message = '莊家獲勝（' + total + ' 點）。';
        announce('bj-result', message, 'lose');
      }
      setButtons(false);
      App.busy = false;
    }

    function deal() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      App.busy = true;
      doubled = false;
      deck = makeDeck();
      player = [deck.shift(), deck.shift()];
      dealer = [deck.shift(), deck.shift()];
      render(true);
      setButtons(true);

      var playerTotal = blackjackValue(player);
      var dealerTotal = blackjackValue(dealer);
      if (playerTotal === 21 && dealerTotal === 21) {
        payout(1);
        announce('bj-result', '雙方 Blackjack，平局。');
        setButtons(false);
        App.busy = false;
      } else if (playerTotal === 21) {
        var amount = payout(2.5);
        announce('bj-result', 'Blackjack！派彩 ' + fmt(amount) + ' 籌碼。', 'win');
        setButtons(false);
        App.busy = false;
      } else {
        announce('bj-result', '玩家 ' + playerTotal + ' 點。要牌或停牌？');
      }
    }

    function hit() {
      if (App.busy || !player.length) { return; }
      player.push(deck.shift());
      var total = blackjackValue(player);
      render(true);
      if (total > 21) {
        announce('bj-result', '玩家 ' + total + ' 點，爆牌。', 'lose');
        setButtons(false);
        App.busy = false;
      } else {
        announce('bj-result', '玩家 ' + total + ' 點。');
        $('bj-double').disabled = true;
      }
    }

    function stand() {
      if (App.busy || !player.length) { return; }
      App.busy = true;
      dealerPlay();
    }

    function doubleDown() {
      if (App.busy || !player.length) { return; }
      if (!placeBet(App.bet)) { return; }
      doubled = true;
      player.push(deck.shift());
      var total = blackjackValue(player);
      render(true);
      if (total > 21) {
        announce('bj-result', '加倍後爆牌（' + total + ' 點）。', 'lose');
        setButtons(false);
        App.busy = false;
      } else {
        App.busy = true;
        dealerPlay();
      }
    }

    return {
      init: function () {
        $('bj-deal').addEventListener('click', deal);
        $('bj-hit').addEventListener('click', hit);
        $('bj-stand').addEventListener('click', stand);
        $('bj-double').addEventListener('click', doubleDown);
        setButtons(false);
      }
    };
  })();

  // ============================================================
  // 遊戲四：歐式輪盤
  // ============================================================
  var Roulette = (function () {
    function optionsFor(type) {
      var out = [];
      if (type === 'number') {
        for (var i = 0; i <= 36; i++) { out.push({ value: String(i), label: String(i) }); }
      } else if (type === 'color') {
        out.push({ value: 'red', label: '紅' }, { value: 'black', label: '黑' });
      } else if (type === 'parity') {
        out.push({ value: 'odd', label: '單' }, { value: 'even', label: '雙' });
      } else {
        out.push({ value: 'small', label: '小（1–18）' }, { value: 'large', label: '大（19–36）' });
      }
      return out;
    }

    function refreshOptions() {
      var select = $('ro-pick');
      select.innerHTML = '';
      optionsFor($('ro-type').value).forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
    }

    function isWin(type, pick, number) {
      if (number === 0) {
        return type === 'number' && pick === '0';
      }
      if (type === 'number') { return pick === String(number); }
      if (type === 'color') { return pick === (RED_NUMBERS[number] ? 'red' : 'black'); }
      if (type === 'parity') { return pick === (number % 2 === 1 ? 'odd' : 'even'); }
      if (type === 'small') { return pick === 'small' ? number <= 18 : number >= 19; }
      return false;
    }

    function spin() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      App.busy = true;
      $('ro-spin').disabled = true;
      var number = RNG.int(0, 36);
      var type = $('ro-type').value;
      var pick = $('ro-pick').value;
      var wheel = $('ro-wheel');
      wheel.classList.add('is-spinning');
      announce('ro-result', '輪盤旋轉中…');

      window.setTimeout(function () {
        wheel.classList.remove('is-spinning');
        wheel.querySelector('span').textContent = number;
        var multiplier = type === 'number' ? 36 : 2;
        if (isWin(type, pick, number)) {
          var amount = payout(multiplier);
          announce('ro-result', '開出 ' + number + '，中獎！派彩 ' + fmt(amount) + ' 籌碼。', 'win');
        } else {
          announce('ro-result', '開出 ' + number + '，未中獎。', 'lose');
        }
        App.busy = false;
        $('ro-spin').disabled = false;
      }, 900);
    }

    return {
      init: function () {
        $('ro-type').addEventListener('change', refreshOptions);
        $('ro-spin').addEventListener('click', spin);
        refreshOptions();
      }
    };
  })();

  // ============================================================
  // 遊戲五：百家樂
  // ============================================================
  var Baccarat = (function () {
    function drawCard() {
      return { rank: RNG.pick(RANKS), suit: RNG.pick(SUITS) };
    }

    function play(betType) {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      App.busy = true;

      var player = [drawCard(), drawCard()];
      var banker = [drawCard(), drawCard()];
      var playerScore = baccaratScore(player);
      var bankerScore = baccaratScore(banker);
      var playerThird = null;

      if (playerScore < 8 && bankerScore < 8) {
        if (playerScore <= 5) {
          playerThird = drawCard();
          player.push(playerThird);
          playerScore = baccaratScore(player);
        }
        var p3 = playerThird ? baccaratCardValue(playerThird) : null;
        var bankerDraw = false;
        if (bankerScore <= 2) {
          bankerDraw = true;
        } else if (bankerScore === 3 && p3 !== 8) {
          bankerDraw = true;
        } else if (bankerScore === 4 && p3 >= 2 && p3 <= 7) {
          bankerDraw = true;
        } else if (bankerScore === 5 && p3 >= 4 && p3 <= 7) {
          bankerDraw = true;
        } else if (bankerScore === 6 && p3 >= 2 && p3 <= 6) {
          bankerDraw = true;
        }
        if (bankerDraw) {
          banker.push(drawCard());
          bankerScore = baccaratScore(banker);
        }
      }

      renderCards($('ba-player'), player, -1);
      renderCards($('ba-banker'), banker, -1);
      $('ba-player-score').textContent = '點數：' + playerScore;
      $('ba-banker-score').textContent = '點數：' + bankerScore;

      var won = false, multiplier = 0, message;
      if (playerScore === bankerScore) {
        won = betType === 'tie';
        multiplier = 8;
        message = '和局（' + playerScore + ' : ' + bankerScore + '）。';
      } else {
        var winner = playerScore > bankerScore ? 'player' : 'banker';
        won = betType === winner;
        multiplier = winner === 'banker' ? 0.95 : 1;
        message = winner === 'player' ? 'Player 獲勝' : 'Banker 獲勝';
        message += '（' + playerScore + ' : ' + bankerScore + '）。';
      }

      if (won) {
        var amount = payout(multiplier);
        announce('ba-result', message + ' 派彩 ' + fmt(amount) + ' 籌碼。', 'win');
      } else {
        announce('ba-result', message + ' 未中獎。', 'lose');
      }
      App.busy = false;
    }

    return {
      init: function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-ba-bet]'), function (button) {
          button.addEventListener('click', function () { play(button.dataset.baBet); });
        });
      }
    };
  })();

  // ============================================================
  // 遊戲六：Plinko（Canvas 2D + requestAnimationFrame）
  // ============================================================
  var Plinko = (function () {
    var canvas = $('plinko-canvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var MULTIPLIERS = [8, 4, 2, 1.3, 0.8, 0.5, 0.8, 1.3, 2, 4, 8];
    var pegs = [];
    var ball = null;
    var raf = null;

    function buildPegs() {
      pegs = [];
      var rows = 9, spacingX = W / (rows + 2), spacingY = 42;
      for (var row = 0; row < rows; row++) {
        var cols = row + 3;
        var startX = (W - (cols - 1) * spacingX) / 2;
        for (var col = 0; col < cols; col++) {
          pegs.push({ x: startX + col * spacingX, y: 70 + row * spacingY });
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d1428';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      pegs.forEach(function (peg) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
      });

      var binW = W / MULTIPLIERS.length;
      for (var i = 0; i < MULTIPLIERS.length; i++) {
        ctx.fillStyle = i % 2 ? '#17203c' : '#1e2949';
        ctx.fillRect(i * binW + 1, 452, binW - 2, 62);
        ctx.fillStyle = MULTIPLIERS[i] >= 2 ? '#fbbf24' : '#cbd5e1';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(MULTIPLIERS[i] + '×', i * binW + binW / 2, 490);
      }

      if (ball) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#fff7d6';
        ctx.stroke();
      }
    }

    function step() {
      if (!ball) { return; }
      ball.vy += 0.22;
      ball.x += ball.vx;
      ball.y += ball.vy;

      for (var i = 0; i < pegs.length; i++) {
        var peg = pegs[i];
        var dx = ball.x - peg.x, dy = ball.y - peg.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 12 && ball.vy > 0) {
          ball.x = peg.x + (dx >= 0 ? 12 : -12);
          ball.vx = (dx >= 0 ? 1 : -1) * (0.8 + Math.random() * 1.2);
          ball.vy = -1.4;
          break;
        }
      }

      if (ball.x < 8) { ball.x = 8; ball.vx = Math.abs(ball.vx); }
      if (ball.x > W - 8) { ball.x = W - 8; ball.vx = -Math.abs(ball.vx); }

      if (ball.y >= 452) {
        var index = Math.min(MULTIPLIERS.length - 1, Math.floor(ball.x / (W / MULTIPLIERS.length)));
        var multiplier = MULTIPLIERS[index];
        var amount = payout(multiplier);
        ball = null;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        draw();
        App.busy = false;
        $('plinko-drop').disabled = false;
        announce('plinko-result', '落入 ' + multiplier + '× 卡槽，派彩 ' + fmt(amount) + ' 籌碼。', 'win');
        return;
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    function drop() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      App.busy = true;
      $('plinko-drop').disabled = true;
      announce('plinko-result', '小球下落中…');
      ball = { x: W / 2 + (Math.random() * 20 - 10), y: 30, vx: (Math.random() * 2 - 1), vy: 0 };
      raf = requestAnimationFrame(step);
    }

    return {
      init: function () {
        buildPegs();
        draw();
        $('plinko-drop').addEventListener('click', drop);
      }
    };
  })();

  // ============================================================
  // 遊戲七：擲硬幣
  // ============================================================
  var Coin = (function () {
    function flip(choice) {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      var result = RNG.pick(['heads', 'tails']);
      $('coin-face').textContent = result === 'heads' ? '🪙' : '🎲';
      var label = result === 'heads' ? '正面' : '反面';
      if (result === choice) {
        var amount = payout(2);
        announce('coin-result', '開出' + label + '，猜中！派彩 ' + fmt(amount) + ' 籌碼。', 'win');
      } else {
        announce('coin-result', '開出' + label + '，未猜中。', 'lose');
      }
    }

    return {
      init: function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-coin]'), function (button) {
          button.addEventListener('click', function () { flip(button.dataset.coin); });
        });
      }
    };
  })();

  // ============================================================
  // 遊戲八：骰子
  // ============================================================
  var Dice = (function () {
    var FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

    function roll() {
      if (App.busy) { return; }
      if (!placeBet(0)) { return; }
      var a = RNG.int(1, 6), b = RNG.int(1, 6), total = a + b;
      $('dice-a').textContent = FACES[a - 1];
      $('dice-b').textContent = FACES[b - 1];
      var type = $('dice-type').value;
      var win = (type === 'small' && total >= 2 && total <= 6) ||
                (type === 'big' && total >= 11 && total <= 12) ||
                (type === 'seven' && total === 7);
      var multiplier = type === 'seven' ? 6 : 2;
      if (win) {
        var amount = payout(multiplier);
        announce('dice-result', '點數和 ' + total + '，中獎！派彩 ' + fmt(amount) + ' 籌碼。', 'win');
      } else {
        announce('dice-result', '點數和 ' + total + '，未中獎。', 'lose');
      }
    }

    return { init: function () { $('dice-roll').addEventListener('click', roll); } };
  })();

  // ============================================================
  // 啟動
  // ============================================================
  function init() {
    updateBalance();
    initTabs();
    $('bet-amount').addEventListener('change', readBet);
    $('reset-balance').addEventListener('click', function () {
      App.credits = START_CREDITS;
      App.busy = false;
      updateBalance();
      announce('slots-result', '試玩籌碼已重置為 ' + fmt(START_CREDITS) + '。');
    });
    Slots.init();
    VideoPoker.init();
    Blackjack.init();
    Roulette.init();
    Baccarat.init();
    Plinko.init();
    Coin.init();
    Dice.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
