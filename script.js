// --- Game State Constants ---
const SUIT_SYMBOLS = { 'Hearts': '♥', 'Diamonds': '♦', 'Clubs': '♣', 'Spades': '♠' };
const SUIT_COLORS = { 'Hearts': 'red', 'Diamonds': 'red', 'Clubs': 'black', 'Spades': 'black' };
const RANKS = ['3', '4', '5', '6', '7', '8', '9', 'Jack', 'Queen', 'King', 'Ace', '2', '10'];
const CPU_DELAY_MS = 1000;

class Player {
  constructor(role, name, id) {
    this.id = id;
    this.role = role;
    this.name = name;
    this.face_down_cards = [];
    this.face_up_cards = [];
    this.hand_cards = [];
  }

  totalCards() {
    return this.hand_cards.length + this.face_up_cards.length + this.face_down_cards.length;
  }
}

let players = [];
let deckOfCards = [];
let discardPile = [];
let clearedPiles = [];
let activePlayerIndex = 0;
let gameOver = false;
let isUserActionInProgress = false;
let activeModalResolve = null;
let currentGameId = 0; // Tracks the active game session to prevent overlapping CPU loops

// --- Helper Functions ---
function getCardRank(cardString) {
  return cardString.split(' ')[0];
}

function getCardSuit(cardString) {
  return cardString.split(' ')[2];
}

function sortCardsByRank(cardArray) {
  return cardArray.sort((a, b) => {
    const rankA = getCardRank(a);
    const rankB = getCardRank(b);
    return RANKS.indexOf(rankA) - RANKS.indexOf(rankB);
  });
}

function checkFourOfAKindClear() {
  if (discardPile.length < 4) return null;

  const len = discardPile.length;
  const lastCard = discardPile[len - 1];
  const lastRank = getCardRank(lastCard);

  for (let i = 1; i <= 4; i++) {
    if (getCardRank(discardPile[len - i]) !== lastRank) {
      return null;
    }
  }
  return lastCard;
}

function userHasLegalMoves() {
  const user = players[0];
  if (!user) return false;

  // Determine which source array the user must play from right now
  let sourceArray = user.hand_cards;
  if (user.hand_cards.length === 0) {
    sourceArray = user.face_up_cards.length > 0 ? user.face_up_cards : user.face_down_cards;
  }

  // If playing from face-down cards, any card is technically flipped/playable blindly
  if (user.hand_cards.length === 0 && user.face_up_cards.length === 0) {
    return true;
  }

  const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const topRank = topCard ? getCardRank(topCard) : null;
  const topValue = topRank ? RANKS.indexOf(topRank) : -1;

  // Check if any card in the current source array can legally beat or match the top card
  for (let i = 0; i < sourceArray.length; i++) {
    const cRank = getCardRank(sourceArray[i]);
    const cVal = RANKS.indexOf(cRank);
    if (!topCard || topRank === '2' || cRank === '2' || cRank === '10' || cRank === 'Ace' || cVal >= topValue) {
      return true;
    }
  }

  return false;
}

function buildPlayerSeats() {
  const container = document.getElementById('seats-container');
  if (!container) return;
  container.innerHTML = '';
  container.className = `players-${players.length}`;

  players.forEach((player, idx) => {
    const seatDiv = document.createElement('div');
    seatDiv.className = `player-seat seat-${idx}`;

    const avatarIcon = player.role === 'user' ? '👤' : '🤖';

    let cardsLayoutHtml = '';
    if (player.role === 'cpu') {
      cardsLayoutHtml = `
        <div class="cards-layout">
          <div class="table-cards-stack">
            <div class="face-down-group" id="fd-${player.id}"></div>
            <div class="face-up-group" id="fu-${player.id}"></div>
          </div>
          <div class="hand-cards" id="hand-${player.id}"></div>
        </div>
      `;
    } else {
      cardsLayoutHtml = `
        <div class="cards-layout">
          <div class="hand-cards" id="hand-${player.id}"></div>
        </div>
      `;
    }

    seatDiv.innerHTML = `
      <div class="player-header">
        <div class="avatar" id="avatar-${player.id}">
          <div class="avatar-icon">${avatarIcon}</div>
          <div class="player-name">${player.name}</div>
        </div>
        <div class="turn-indicator" id="turn-indicator-${player.id}">
          ${player.role === 'user' ? 'Your turn!' : `${player.name}'s turn!`}
        </div>
      </div>
      ${cardsLayoutHtml}
    `;
    container.appendChild(seatDiv);
  });
}

function updateTurnIndicatorVisibility() {
  players.forEach((player, idx) => {
    const indicator = document.getElementById(`turn-indicator-${player.id}`);
    const avatar = document.getElementById(`avatar-${player.id}`);
    const isActive = (idx === activePlayerIndex && !gameOver);

    if (indicator) {
      indicator.style.visibility = isActive ? 'visible' : 'hidden';
      if (isActive) {
        if (player.role === 'user' && !userHasLegalMoves()) {
          indicator.innerText = 'Pick Up The Discard Pile!';
        } else {
          indicator.innerText = player.role === 'user' ? 'Your turn!' : `${player.name}'s turn!`;
        }
      }
    }
    if (avatar) {
      if (isActive) {
        avatar.classList.add('active-turn');
      } else {
        avatar.classList.remove('active-turn');
      }
    }
  });
}

function createCardElement(cardString, isFaceDown = false) {
  const cardDiv = document.createElement('div');
  
  if (isFaceDown) {
    cardDiv.className = 'card card-back';
    return cardDiv;
  }

  const rank = getCardRank(cardString);
  const suit = getCardSuit(cardString);
  const symbol = SUIT_SYMBOLS[suit];
  const color = SUIT_COLORS[suit];

  cardDiv.className = `card ${color}`;
  cardDiv.innerHTML = `
    <div class="card-corner top">
      <span class="card-rank">${rank === '10' ? '10' : rank[0]}</span>
      <span class="card-suit">${symbol}</span>
    </div>
    <div class="card-center-suit">${symbol}</div>
    <div class="card-corner bottom">
      <span class="card-rank">${rank === '10' ? '10' : rank[0]}</span>
      <span class="card-suit">${symbol}</span>
    </div>
  `;
  return cardDiv;
}

function updateStatus(text = '') {
  document.getElementById('status-box').innerText = text;
}

function checkWinCondition(player) {
  if (player.totalCards() === 0) {
    gameOver = true;
    updateStatus(`${player.name} wins the game!`);
    
    // Trigger the exciting centered victory modal
    const overlay = document.getElementById('victory-overlay');
    const msgText = document.getElementById('victory-message-text');
    if (msgText) {
      msgText.innerText = `${player.name} has won the game!`;
    }
    if (overlay) {
      overlay.classList.add('visible');
    }
    return true;
  }
  return false;
}

// --- Table UI Renderer ---
function renderTable() {
  const modal = document.getElementById('card-choice-modal');
  if (modal) {
    modal.classList.add('hidden');
  }

  const deckCountEl = document.getElementById('deck-count');
  const deckCountSecEl = document.getElementById('deck-count-secondary');
  const drawDeckEl = document.getElementById('draw-deck');

  if (deckCountEl) deckCountEl.innerText = deckOfCards.length;
  if (deckCountSecEl) deckCountSecEl.innerText = discardPile.length;

  if (drawDeckEl) {
    drawDeckEl.style.visibility = deckOfCards.length > 0 ? 'visible' : 'hidden';
  }

  // Render Discard Pile with Click-to-Pick-Up Behavior for User
  const discardSlot = document.getElementById('discard-pile');
  if (discardSlot) {
    discardSlot.innerHTML = '';
    discardSlot.onclick = null;
    discardSlot.classList.remove('playable');
    discardSlot.classList.remove('bounce-effect');

    if (discardPile.length > 0) {
      const topCard = discardPile[discardPile.length - 1];
      discardSlot.appendChild(createCardElement(topCard));

      const activePlayer = players[activePlayerIndex];
      if (activePlayer && activePlayer.role === 'user' && !gameOver) {
        discardSlot.classList.add('playable');
        discardSlot.onclick = userPickUpPile;

        // Add bouncing effect if the user has no legal moves to play
        if (!userHasLegalMoves()) {
          discardSlot.classList.add('bounce-effect');
        }
      }
    } else {
      discardSlot.innerHTML = '<span class="empty-text">EMPTY</span>';
    }
  }

  // Render Cleared Piles
  const clearedContainer = document.getElementById('cleared-piles-container');
  if (clearedContainer) {
    clearedContainer.innerHTML = '';
    clearedPiles.forEach((pile) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'cleared-pile-wrapper';

      const cardEl = createCardElement(pile.topCard);
      cardEl.classList.add('cleared-pile-card');

      const badge = document.createElement('span');
      badge.className = 'badge badge-orange';
      badge.innerText = pile.cards.length;

      wrapper.appendChild(cardEl);
      wrapper.appendChild(badge);
      clearedContainer.appendChild(wrapper);
    });
  }

  // Update Player Cards in Place (Without rebuilding seats)
  players.forEach((player) => {
    if (player.role === 'cpu') {
      const fdContainer = document.getElementById(`fd-${player.id}`);
      if (fdContainer) {
        fdContainer.innerHTML = '';
        player.face_down_cards.forEach(() => {
          fdContainer.appendChild(createCardElement('', true));
        });
      }

      const fuContainer = document.getElementById(`fu-${player.id}`);
      if (fuContainer) {
        fuContainer.innerHTML = '';
        player.face_up_cards.forEach((card) => {
          fuContainer.appendChild(createCardElement(card));
        });
      }
    }

    const handContainer = document.getElementById(`hand-${player.id}`);
    if (handContainer) {
      if (player.role === 'user') {
        sortCardsByRank(player.hand_cards);
      }

      // Generate a signature of the current hand to prevent unnecessary DOM reconstruction
      const handSignature = JSON.stringify(player.hand_cards);

      if (handContainer.dataset.signature !== handSignature) {
        handContainer.dataset.signature = handSignature;
        handContainer.innerHTML = '';

        player.hand_cards.forEach((card, cIdx) => {
          const cardEl = createCardElement(card, player.role !== 'user');
          if (player.role === 'user') {
            cardEl.onclick = () => handleUserCardClick(cIdx);
          }
          handContainer.appendChild(cardEl);
        });
      }
    }
  });

  renderUserFooterCards();
  updateTurnIndicatorVisibility();
}

function renderUserFooterCards() {
  const user = players.find(p => p.role === 'user');
  const fdContainer = document.getElementById('user-face-down-group');
  const fuContainer = document.getElementById('user-face-up-group');
  const seatZeroHandContainer = document.querySelector('.seat-0 .cards-layout .hand-cards');

  if (!user || !fdContainer || !fuContainer) return;

  const isHandEmpty = user.hand_cards.length === 0;
  const isFaceUpEmpty = user.face_up_cards.length === 0;

  // --- 1. Face-Up Cards Render (with Signature Diff-Checking) ---
  const fuPlayable = isHandEmpty || userCanPlayTableCards(user, 'up');
  const fuSignature = JSON.stringify({
    cards: user.face_up_cards,
    isHandEmpty,
    playable: fuPlayable
  });

  const fuNeedsUpdate = fuContainer.dataset.signature !== fuSignature || 
                        (isHandEmpty && seatZeroHandContainer && seatZeroHandContainer.dataset.fuSignature !== fuSignature);

  if (fuNeedsUpdate) {
    fuContainer.dataset.signature = fuSignature;
    if (seatZeroHandContainer) seatZeroHandContainer.dataset.fuSignature = fuSignature;

    fuContainer.innerHTML = '';

    if (isHandEmpty && user.face_up_cards.length > 0 && seatZeroHandContainer) {
      seatZeroHandContainer.innerHTML = '';
      user.face_up_cards.forEach((card, cIdx) => {
        const cardEl = createCardElement(card);
        cardEl.classList.add('playable');
        cardEl.onclick = () => handleUserFaceUpClick(cIdx);
        seatZeroHandContainer.appendChild(cardEl);
      });
    } else {
      user.face_up_cards.forEach((card, cIdx) => {
        const cardEl = createCardElement(card);
        if (userCanPlayTableCards(user, 'up')) {
          cardEl.classList.add('playable');
          cardEl.onclick = () => handleUserFaceUpClick(cIdx);
        }
        fuContainer.appendChild(cardEl);
      });
    }
  }

  // --- 2. Face-Down Cards Render (with Signature Diff-Checking) ---
  const fdPlayable = isHandEmpty && isFaceUpEmpty;
  const fdSignature = JSON.stringify({
    count: user.face_down_cards.length,
    isHandEmpty,
    isFaceUpEmpty,
    playable: fdPlayable
  });

  const fdNeedsUpdate = fdContainer.dataset.signature !== fdSignature || 
                        (isHandEmpty && isFaceUpEmpty && seatZeroHandContainer && seatZeroHandContainer.dataset.fdSignature !== fdSignature);

  if (fdNeedsUpdate) {
    fdContainer.dataset.signature = fdSignature;
    if (seatZeroHandContainer) seatZeroHandContainer.dataset.fdSignature = fdSignature;

    fdContainer.innerHTML = '';

    if (isHandEmpty && isFaceUpEmpty && user.face_down_cards.length > 0 && seatZeroHandContainer) {
      seatZeroHandContainer.innerHTML = '';
      user.face_down_cards.forEach((card, cIdx) => {
        const cardEl = createCardElement('', true);
        cardEl.classList.add('playable');
        cardEl.onclick = () => handleUserFaceDownClick(cIdx);
        seatZeroHandContainer.appendChild(cardEl);
      });
    } else {
      user.face_down_cards.forEach((card, cIdx) => {
        const cardEl = createCardElement('', true);
        if (userCanPlayTableCards(user, 'down')) {
          cardEl.classList.add('playable');
          cardEl.onclick = () => handleUserFaceDownClick(cIdx);
        }
        fdContainer.appendChild(cardEl);
      });
    }
  }
}

function userCanPlayTableCards(user, type) {
  if (user.hand_cards.length > 0) return false;
  if (type === 'down' && user.face_up_cards.length > 0) return false;
  return true;
}

// --- Game Logic ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function findStartingPlayer(players) {
  let lowestRankValue = Infinity;
  let startingPlayerIndex = 0;

  players.forEach((player, playerIdx) => {
    player.face_up_cards.forEach(card => {
      const cardRank = getCardRank(card);
      const cardValue = RANKS.indexOf(cardRank);

      if (cardValue < lowestRankValue) {
        lowestRankValue = cardValue;
        startingPlayerIndex = playerIdx;
      }
    });
  });

  return { startingPlayer: players[startingPlayerIndex], startingIndex: startingPlayerIndex };
}

function playPalace() {
  currentGameId++; // Invalidate any previous running game loops/timeouts
  const localGameId = currentGameId;

  // (Keep the rest of your existing playPalace code right below this...)
  // Clear any existing victory overlay when starting a new game
  const victoryOverlay = document.getElementById('victory-overlay');
  if (victoryOverlay) {
    victoryOverlay.classList.remove('visible');
  }

  gameOver = false;
  const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  deckOfCards = [];
  
  for (const suit of suits) {
    for (const rank of RANKS) {
      deckOfCards.push(`${rank} of ${suit}`);
    }
  }
  deckOfCards = shuffle(deckOfCards);

  const playerSelect = document.getElementById('player-select');
  const selectedCount = playerSelect ? parseInt(playerSelect.value, 10) : 4;

  players = [new Player("user", "You", 0)];
  for (let i = 1; i < selectedCount; i++) {
    players.push(new Player("cpu", `CPU ${i}`, i));
  }

  players.forEach(p => {
    p.face_down_cards = [deckOfCards.pop(), deckOfCards.pop(), deckOfCards.pop()];
    p.face_up_cards = [deckOfCards.pop(), deckOfCards.pop(), deckOfCards.pop()];
    p.hand_cards = [deckOfCards.pop(), deckOfCards.pop(), deckOfCards.pop()];
    if (p.role === 'user') {
      sortCardsByRank(p.hand_cards);
    }
  });

  discardPile = [];
  clearedPiles = [];

  const { startingPlayer, startingIndex } = findStartingPlayer(players);
  activePlayerIndex = startingIndex;

  buildPlayerSeats();
  renderTable();
  setupUserControls();

  updateStatus(`The first move of the game belongs to: ${startingPlayer.name}!`);

  if (startingPlayer.role === 'cpu') {
    playCpuTurn();
  }
}

function setupUserControls() {
  const controlsDiv = document.getElementById('controls');
  if (controlsDiv) {
    controlsDiv.innerHTML = '';
  }
}

function promptCardCount(rank, maxCount) {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-choice-modal');
    const title = document.getElementById('modal-title');
    const optionsDiv = document.getElementById('modal-options');

    title.innerText = `Play how many ${rank}s?`;
    optionsDiv.innerHTML = '';

    for (let i = 1; i <= maxCount; i++) {
      const btn = document.createElement('button');
      btn.className = 'modal-btn';
      btn.innerText = i === 1 ? `Play 1` : `Play ${i}`;
      btn.onclick = () => {
        modal.classList.add('hidden');
        resolve(i);
      };
      optionsDiv.appendChild(btn);
    }

    modal.classList.remove('hidden');
  });
}

function promptPlayMatchedModal(rank, maxCount) {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-choice-modal');
    const title = document.getElementById('modal-title');
    const optionsDiv = document.getElementById('modal-options');

    title.innerText = `You drew a matching ${rank}! Play it?`;
    optionsDiv.innerHTML = '';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'modal-btn';
    yesBtn.innerText = 'Yes';
    yesBtn.onclick = () => {
      if (maxCount > 1) {
        title.innerText = `Play how many ${rank}s?`;
        optionsDiv.innerHTML = '';
        for (let i = 1; i <= maxCount; i++) {
          const btn = document.createElement('button');
          btn.className = 'modal-btn';
          btn.innerText = `Play ${i}`;
          btn.onclick = () => {
            modal.classList.add('hidden');
            resolve(i);
          };
          optionsDiv.appendChild(btn);
        }
      } else {
        modal.classList.add('hidden');
        resolve(1);
      }
    };

    const noBtn = document.createElement('button');
    noBtn.className = 'modal-btn';
    noBtn.innerText = 'No';
    noBtn.onclick = () => {
      modal.classList.add('hidden');
      resolve(0);
    };

    optionsDiv.appendChild(yesBtn);
    optionsDiv.appendChild(noBtn);
    modal.classList.remove('hidden');
  });
}

function promptYesNo(titleText) {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-choice-modal');
    const title = document.getElementById('modal-title');
    const optionsDiv = document.getElementById('modal-options');

    title.innerText = titleText;
    optionsDiv.innerHTML = '';

    const yesBtn = document.createElement('button');
    yesBtn.className = 'modal-btn';
    yesBtn.innerText = 'Yes';
    yesBtn.onclick = () => {
      modal.classList.add('hidden');
      resolve(true);
    };

    const noBtn = document.createElement('button');
    noBtn.className = 'modal-btn';
    noBtn.innerText = 'No';
    noBtn.onclick = () => {
      modal.classList.add('hidden');
      resolve(false);
    };

    optionsDiv.appendChild(yesBtn);
    optionsDiv.appendChild(noBtn);
    modal.classList.remove('hidden');
  });
}

async function handleUserCardClick(cardIndex) {
  if (gameOver || players[activePlayerIndex].role !== 'user' || isUserActionInProgress) return;
  isUserActionInProgress = true;

  try {
    const user = players[0];
    const selectedCard = user.hand_cards[cardIndex];
    if (!selectedCard) return;

    const cardRank = getCardRank(selectedCard);
    const cardValue = RANKS.indexOf(cardRank);

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const topRank = topCard ? getCardRank(topCard) : null;
    const topValue = topRank ? RANKS.indexOf(topRank) : -1;

    if (topCard && topRank !== '2' && !['2', '10', 'Ace'].includes(cardRank) && cardValue < topValue) {
      return;
    }

    const matchingIndices = [];
    user.hand_cards.forEach((c, idx) => {
      if (getCardRank(c) === cardRank) {
        matchingIndices.push(idx);
      }
    });

    let countToPlay = 1;
    if (matchingIndices.length > 1) {
      countToPlay = await promptCardCount(cardRank, matchingIndices.length);
    }

    const indicesToRemove = matchingIndices.slice(0, countToPlay).sort((a, b) => b - a);
    indicesToRemove.forEach(idx => {
      const [played] = user.hand_cards.splice(idx, 1);
      discardPile.push(played);
    });

    // 1. Immediately display the discarded card(s) onto the discard pile
    renderTable();

    // 2. Replenish hand up to minimum 3 cards from the deck if cards remain
    const newlyAcquired = [];
    while (user.hand_cards.length < 3 && deckOfCards.length > 0) {
      const drawnCard = deckOfCards.pop();
      user.hand_cards.push(drawnCard);
      newlyAcquired.push(drawnCard);
    }

    renderTable();

    // 3. Check if any newly acquired hand cards match the discarded rank
    const newMatchIndices = [];
    user.hand_cards.forEach((c, idx) => {
      if (getCardRank(c) === cardRank && newlyAcquired.includes(c)) {
        newMatchIndices.push(idx);
      }
    });

    if (newMatchIndices.length > 0) {
      const playChoice = await promptPlayMatchedModal(cardRank, newMatchIndices.length);
      if (playChoice > 0) {
        const subIndicesToRemove = newMatchIndices.slice(0, playChoice).sort((a, b) => b - a);
        subIndicesToRemove.forEach(idx => {
          const [playedSub] = user.hand_cards.splice(idx, 1);
          discardPile.push(playedSub);
        });
        renderTable();
      }
    }

    const fourOfAKindCard = checkFourOfAKindClear();

    if (cardRank === '10') {
      const cardsPlayedThisTurn = discardPile.slice(-countToPlay);
      cardsPlayedThisTurn.forEach(c => {
        clearedPiles.push({
          cards: [...discardPile],
          topCard: c
        });
      });
      discardPile = [];

      while (user.hand_cards.length < 3 && deckOfCards.length > 0) {
        user.hand_cards.push(deckOfCards.pop());
      }
      if (checkWinCondition(user)) {
        renderTable();
        return;
      }

      renderTable();
      return;
    } else if (fourOfAKindCard) {
      clearedPiles.push({
        cards: [...discardPile],
        topCard: fourOfAKindCard
      });
      discardPile = [];

      while (user.hand_cards.length < 3 && deckOfCards.length > 0) {
        user.hand_cards.push(deckOfCards.pop());
      }
      if (checkWinCondition(user)) {
        renderTable();
        return;
      }

      renderTable();
      return;
    } else if (cardRank === '2') {
      while (user.hand_cards.length < 3 && deckOfCards.length > 0) {
        user.hand_cards.push(deckOfCards.pop());
      }
      if (checkWinCondition(user)) {
        renderTable();
        return;
      }

      renderTable();
      return;
    }

    while (user.hand_cards.length < 3 && deckOfCards.length > 0) {
      user.hand_cards.push(deckOfCards.pop());
    }

    if (checkWinCondition(user)) {
      renderTable();
      return;
    }

    renderTable();
    nextTurn();
  } finally {
    isUserActionInProgress = false;
  }
}

function handleUserFaceUpClick(cardIndex) {
  if (gameOver || players[activePlayerIndex].role !== 'user' || isUserActionInProgress) return;
  isUserActionInProgress = true;

  try {
    const user = players[0];
    if (!userCanPlayTableCards(user, 'up')) return;

    const cardToPlay = user.face_up_cards.splice(cardIndex, 1)[0];
    if (!cardToPlay) return;

    const cardRank = getCardRank(cardToPlay);
    const cardValue = RANKS.indexOf(cardRank);

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const topRank = topCard ? getCardRank(topCard) : null;
    const topValue = topRank ? RANKS.indexOf(topRank) : -1;

    if (topCard && topRank !== '2' && !['2', '10', 'Ace'].includes(cardRank) && cardValue < topValue) {
      user.face_up_cards.splice(cardIndex, 0, cardToPlay);
      return;
    }

    discardPile.push(cardToPlay);

    if (checkWinCondition(user)) {
      renderTable();
      return;
    }

    const fourOfAKindCard = checkFourOfAKindClear();

    if (cardRank === '10' || fourOfAKindCard) {
      clearedPiles.push({
        cards: [...discardPile],
        topCard: cardRank === '10' ? cardToPlay : fourOfAKindCard
      });
      discardPile = [];
      renderTable();
      return;
    } else if (cardRank === '2') {
      renderTable();
      return;
    }

    renderTable();
    nextTurn();
  } finally {
    isUserActionInProgress = false;
  }
}

function handleUserFaceDownClick(cardIndex) {
  if (gameOver || players[activePlayerIndex].role !== 'user' || isUserActionInProgress) return;
  isUserActionInProgress = true;

  try {
    const user = players[0];
    if (!userCanPlayTableCards(user, 'down')) return;

    const cardToPlay = user.face_down_cards.splice(cardIndex, 1)[0];
    if (!cardToPlay) return;

    const cardRank = getCardRank(cardToPlay);
    const cardValue = RANKS.indexOf(cardRank);

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const topRank = topCard ? getCardRank(topCard) : null;
    const topValue = topRank ? RANKS.indexOf(topRank) : -1;

    discardPile.push(cardToPlay);

    if (topCard && topRank !== '2' && !['2', '10', 'Ace'].includes(cardRank) && cardValue < topValue) {
      user.hand_cards.push(...discardPile);
      discardPile = [];
      renderTable();
      nextTurn();
      return;
    }

    if (checkWinCondition(user)) {
      renderTable();
      return;
    }

    if (cardRank === '10' || checkFourOfAKindClear()) {
      if (clearedPiles.length < 4) {
        clearedPiles.push({
          cards: [...discardPile],
          topCard: cardToPlay
        });
      }
      discardPile = [];
      renderTable();
      return;
    } else if (cardRank === '2') {
      renderTable();
      return;
    }

    renderTable();
    nextTurn();
  } finally {
    isUserActionInProgress = false;
  }
}

function userPickUpPile() {
  if (gameOver || players[activePlayerIndex].role !== 'user' || isUserActionInProgress) return;
  if (discardPile.length === 0) return;
  isUserActionInProgress = true;

  try {
    const user = players[0];
    const pickedUpCards = [...discardPile];
    discardPile = [];

    user.hand_cards.push(...pickedUpCards);
    sortCardsByRank(user.hand_cards);

    const seatZeroHandContainer = document.querySelector('.seat-0 .cards-layout .hand-cards');
    if (seatZeroHandContainer) {
      seatZeroHandContainer.dataset.signature = '';
    }

    renderTable();
    nextTurn();
  } finally {
    isUserActionInProgress = false;
  }
}

function nextTurn() {
  if (gameOver) return;

  updateStatus('');

  activePlayerIndex = (activePlayerIndex + 1) % players.length;
  renderTable();
  
  if (players[activePlayerIndex].role === 'cpu') playCpuTurn();
}

async function playCpuTurn() {
  if (gameOver) return;
  const localGameId = currentGameId; // Capture the session ID at the start

  renderTable();
  await new Promise(resolve => setTimeout(resolve, CPU_DELAY_MS));
  if (currentGameId !== localGameId || gameOver) return; // Guard against rapid restarts

  const cpu = players[activePlayerIndex];
  const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const topRank = topCard ? getCardRank(topCard) : null;
  const topValue = topRank ? RANKS.indexOf(topRank) : -1;

  let sourceArray = cpu.hand_cards;
  if (cpu.hand_cards.length === 0) {
    sourceArray = cpu.face_up_cards.length > 0 ? cpu.face_up_cards : cpu.face_down_cards;
  }

  let validCardIndex = -1;
  for (let i = 0; i < sourceArray.length; i++) {
    const cRank = getCardRank(sourceArray[i]);
    const cVal = RANKS.indexOf(cRank);
    if (!topCard || topRank === '2' || cRank === '2' || cRank === '10' || cRank === 'Ace' || cVal >= topValue) {
      validCardIndex = i;
      break;
    }
  }

  if (validCardIndex === -1) {
    cpu.hand_cards.push(...discardPile);
    discardPile = [];
    renderTable();
    nextTurn();
    return;
  }

  const targetRank = getCardRank(sourceArray[validCardIndex]);
  let cardsToPlay = [];

  if (sourceArray === cpu.hand_cards || sourceArray === cpu.face_up_cards) {
    if (targetRank === '2' || targetRank === '10') {
      cardsToPlay.push(sourceArray.splice(validCardIndex, 1)[0]);
    } else {
      for (let i = sourceArray.length - 1; i >= 0; i--) {
        if (getCardRank(sourceArray[i]) === targetRank) {
          cardsToPlay.push(sourceArray.splice(i, 1)[0]);
        }
      }
    }
  } else {
    cardsToPlay.push(sourceArray.splice(validCardIndex, 1)[0]);
  }

  const playedRank = targetRank;
  cardsToPlay.forEach(card => discardPile.push(card));

  while (cpu.hand_cards.length < 3 && deckOfCards.length > 0) {
    cpu.hand_cards.push(deckOfCards.pop());
  }

  if (checkWinCondition(cpu)) {
    renderTable();
    return;
  }

  const fourOfAKindCard = checkFourOfAKindClear();
  if (playedRank === '10' || fourOfAKindCard) {
    if (playedRank === '10') {
      cardsToPlay.forEach(card => {
        if (clearedPiles.length < 4) {
          clearedPiles.push({ cards: [...discardPile], topCard: card });
        }
      });
    } else {
      if (clearedPiles.length < 4) {
        clearedPiles.push({ cards: [...discardPile], topCard: cardsToPlay[cardsToPlay.length - 1] });
      }
    }
    discardPile = [];

    renderTable();
    playCpuTurn();
    return;
  } else if (playedRank === '2') {
    renderTable();
    playCpuTurn();
    return;
  }

  let activePlayedRank = playedRank;

  while (true) {
    const handSizeBeforeDraw = cpu.hand_cards.length;

    while (cpu.hand_cards.length < 3 && deckOfCards.length > 0) {
      cpu.hand_cards.push(deckOfCards.pop());
    }

    if (checkWinCondition(cpu)) {
      renderTable();
      return;
    }

    renderTable();
    await new Promise(resolve => setTimeout(resolve, CPU_DELAY_MS));
    if (currentGameId !== localGameId || gameOver) return; // Guard against rapid restarts

    const newlyDrawnCards = cpu.hand_cards.slice(handSizeBeforeDraw);
    const hasMatch = newlyDrawnCards.some(c => getCardRank(c) === activePlayedRank);

    if (!hasMatch || activePlayedRank === '2' || activePlayedRank === '10') {
      break;
    }

    let additionalCards = [];
    for (let i = cpu.hand_cards.length - 1; i >= 0; i--) {
      if (getCardRank(cpu.hand_cards[i]) === activePlayedRank) {
        additionalCards.push(cpu.hand_cards.splice(i, 1)[0]);
      }
    }

    if (additionalCards.length > 0) {
      additionalCards.forEach(c => discardPile.push(c));

      while (cpu.hand_cards.length < 3 && deckOfCards.length > 0) {
        cpu.hand_cards.push(deckOfCards.pop());
      }

      if (checkWinCondition(cpu)) {
        renderTable();
        return;
      }

      const fOAK = checkFourOfAKindClear();
      if (fOAK) {
        clearedPiles.push({ cards: [...discardPile], topCard: fOAK });
        discardPile = [];
        renderTable();
        playCpuTurn();
        return;
      }
    } else {
      break;
    }
  }

  renderTable();
  nextTurn();
}

// --- How To Play Tooltip Fallback Handler ---
document.addEventListener('DOMContentLoaded', () => {
  const howToPlayWrapper = document.getElementById('how-to-play-wrapper');
  if (howToPlayWrapper) {
    howToPlayWrapper.addEventListener('click', function(e) {
      this.classList.toggle('active');
      e.stopPropagation();
    });
  }
  document.addEventListener('click', function() {
    const wrapper = document.getElementById('how-to-play-wrapper');
    if (wrapper) {
      wrapper.classList.remove('active');
    }
  });
});