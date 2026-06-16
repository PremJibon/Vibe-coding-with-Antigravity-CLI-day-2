// State management
let state = {
    updates: [],
    filteredUpdates: [],
    selectedUpdate: null,
    currentFilter: 'all',
    searchQuery: '',
    lastUpdated: '',
    currentTemplate: 'default'
};

// DOM Elements
const notesContainer = document.getElementById('notes-container');
const skeletonLoader = document.getElementById('skeleton-loader');
const errorAlert = document.getElementById('error-alert');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const resultsCount = document.getElementById('results-count');
const refreshBtn = document.getElementById('refresh-btn');
const refreshIcon = refreshBtn.querySelector('.spinner-icon');
const syncStatus = document.getElementById('sync-status');
const searchInput = document.getElementById('search-input');
const clearSearch = document.getElementById('clear-search');
const filterBtns = document.querySelectorAll('.filter-btn');
const retryBtn = document.getElementById('retry-btn');

// Composer DOM Elements
const composerActive = document.getElementById('composer-active');
const composerEmpty = document.getElementById('composer-empty');
const composerBadgeType = document.getElementById('composer-badge-type');
const composerBadgeDate = document.getElementById('composer-badge-date');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountText = document.getElementById('char-count-text');
const btnCopyTweet = document.getElementById('btn-copy-tweet');
const btnPublishTweet = document.getElementById('btn-publish-tweet');
const templateBtns = document.querySelectorAll('.template-btn');

// Toast Element
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

/* -------------------------------------------------------------
 * 1. INITIALIZATION & DATA FETCHING
 * ------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    fetchNotes();
    setupEventListeners();
});

// Fetch Release Notes
async function fetchNotes(refresh = false) {
    showLoading();
    
    const url = refresh ? '/api/refresh' : '/api/notes';
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            state.updates = data.updates;
            state.lastUpdated = data.last_updated;
            
            // Format state.updates links and fields
            state.updates.forEach(u => {
                // Ensure link is fully absolute
                if (u.link && u.link.startsWith('/')) {
                    u.link = 'https://cloud.google.com' + u.link;
                }
            });
            
            updateStatusText(refresh ? 'Refreshed' : 'Loaded');
            filterAndRender();
            updateFilterCounts();
            
            if (refresh) {
                showToast('Release notes refreshed successfully!');
            }
        } else {
            showError(data.error || 'Failed to fetch release notes.');
        }
    } catch (err) {
        showError('Network error. Make sure the server is running.');
        console.error(err);
    }
}

// Show/Hide States
function showLoading() {
    skeletonLoader.style.display = 'block';
    notesContainer.style.display = 'none';
    errorAlert.style.display = 'none';
    emptyState.style.display = 'none';
    
    refreshIcon.classList.add('spinning');
    syncStatus.textContent = 'Syncing...';
    document.querySelector('.status-dot').className = 'status-dot loading';
}

function updateStatusText(action) {
    refreshIcon.classList.remove('spinning');
    document.querySelector('.status-dot').className = 'status-dot';
    
    if (state.lastUpdated) {
        syncStatus.textContent = `Sync: ${state.lastUpdated}`;
    } else {
        syncStatus.textContent = 'Notes synced';
    }
}

function showError(msg) {
    skeletonLoader.style.display = 'none';
    notesContainer.style.display = 'none';
    errorAlert.style.display = 'flex';
    emptyState.style.display = 'none';
    
    errorMessage.textContent = msg;
    refreshIcon.classList.remove('spinning');
    document.querySelector('.status-dot').className = 'status-dot error';
    syncStatus.textContent = 'Sync failed';
    showToast('Failed to load release notes!', true);
}

/* -------------------------------------------------------------
 * 2. FILTERING & SEARCH LOGIC
 * ------------------------------------------------------------- */
function filterAndRender() {
    const query = state.searchQuery.toLowerCase().trim();
    const filter = state.currentFilter;
    
    state.filteredUpdates = state.updates.filter(update => {
        // Category Filter
        const matchesCategory = filter === 'all' || 
            (filter === 'Other' && !['Feature', 'Issue', 'Deprecation', 'Announcement'].includes(update.type)) ||
            update.type.toLowerCase() === filter.toLowerCase();
            
        // Search Filter
        const matchesSearch = !query || 
            update.type.toLowerCase().includes(query) ||
            update.date.toLowerCase().includes(query) ||
            update.text.toLowerCase().includes(query);
            
        return matchesCategory && matchesSearch;
    });
    
    renderUpdates();
}

function updateFilterCounts() {
    const counts = {
        all: state.updates.length,
        Feature: 0,
        Issue: 0,
        Deprecation: 0,
        Announcement: 0,
        Other: 0
    };
    
    state.updates.forEach(u => {
        if (['Feature', 'Issue', 'Deprecation', 'Announcement'].includes(u.type)) {
            counts[u.type]++;
        } else {
            counts['Other']++;
        }
    });
    
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-feature').textContent = counts.Feature;
    document.getElementById('count-issue').textContent = counts.Issue;
    document.getElementById('count-deprecation').textContent = counts.Deprecation;
    document.getElementById('count-announcement').textContent = counts.Announcement;
    document.getElementById('count-other').textContent = counts.Other;
}

/* -------------------------------------------------------------
 * 3. RENDER FEED CARDS
 * ------------------------------------------------------------- */
function renderUpdates() {
    skeletonLoader.style.display = 'none';
    resultsCount.textContent = `${state.filteredUpdates.length} updates found`;
    
    if (state.filteredUpdates.length === 0) {
        notesContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    notesContainer.style.display = 'flex';
    notesContainer.innerHTML = '';
    
    state.filteredUpdates.forEach(update => {
        const card = document.createElement('div');
        const cardTypeClass = `type-${getCategoryClass(update.type)}`;
        const isSelected = state.selectedUpdate && state.selectedUpdate.id === update.id;
        
        card.className = `note-card ${cardTypeClass} ${isSelected ? 'selected' : ''}`;
        card.setAttribute('data-id', update.id);
        
        // Build card HTML
        card.innerHTML = `
            <div class="card-header">
                <span class="type-pill">${update.type}</span>
                <div class="card-meta">
                    <span class="card-date">${update.date}</span>
                </div>
            </div>
            <div class="card-body">
                ${update.html}
            </div>
            <div class="card-footer">
                <a href="${update.link}" class="feed-link" target="_blank" rel="noopener noreferrer">
                    <span>View Docs</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
                <button class="btn btn-select-card">
                    ${isSelected ? 'Selected' : 'Select for Tweet'}
                </button>
            </div>
        `;
        
        // Add card selection event (clicking anywhere or the button selects the update)
        card.addEventListener('click', (e) => {
            // Avoid selecting if user clicks an actual link inside the card
            if (e.target.tagName.toLowerCase() === 'a' || e.target.closest('a')) {
                return;
            }
            selectUpdate(update);
        });
        
        notesContainer.appendChild(card);
    });
}

function getCategoryClass(type) {
    const mainTypes = ['feature', 'issue', 'deprecation', 'announcement'];
    const lowered = type.toLowerCase();
    return mainTypes.includes(lowered) ? lowered : 'other';
}

/* -------------------------------------------------------------
 * 4. TWEET COMPOSER SYSTEM
 * ------------------------------------------------------------- */
function selectUpdate(update) {
    // Toggle selection
    if (state.selectedUpdate && state.selectedUpdate.id === update.id) {
        state.selectedUpdate = null;
        composerActive.style.display = 'none';
        composerEmpty.style.display = 'flex';
        
        // Remove select class from all cards
        document.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
        const activeCardBtn = document.querySelector(`.note-card[data-id="${update.id}"] .btn-select-card`);
        if (activeCardBtn) activeCardBtn.textContent = 'Select for Tweet';
        return;
    }
    
    state.selectedUpdate = update;
    
    // Highlight active card
    document.querySelectorAll('.note-card').forEach(c => {
        const cardId = c.getAttribute('data-id');
        if (cardId === update.id) {
            c.classList.add('selected');
            c.querySelector('.btn-select-card').textContent = 'Selected';
        } else {
            c.classList.remove('selected');
            c.querySelector('.btn-select-card').textContent = 'Select for Tweet';
        }
    });
    
    // Display Composer
    composerEmpty.style.display = 'none';
    composerActive.style.display = 'flex';
    
    // Set badges
    composerBadgeType.textContent = update.type;
    composerBadgeType.className = `badge type-${getCategoryClass(update.type)}`;
    composerBadgeDate.textContent = update.date;
    
    // Apply default template
    applyTemplate(state.currentTemplate);
    
    // Scroll composer into view on mobile
    if (window.innerWidth <= 1200) {
        composerActive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Generate Tweet based on template styles
function generateTweetText(update, templateStyle) {
    if (!update) return '';
    
    const typeLabel = update.type.toUpperCase();
    const dateStr = update.date;
    const linkStr = update.link || 'https://cloud.google.com/bigquery';
    
    // Truncate details. Let's make sure the text length fits nicely
    // Calculate total character limit space available for the text body.
    // Twitter counts all links as exactly 23 characters.
    // Length of structural template:
    // Default template outline: "BigQuery [TYPE] (DATE): TEXT \n\nDetails: LINK"
    const staticLength = 23 + 30; // 23 characters for link, around 30 characters for the structure
    const targetLength = 280 - staticLength;
    
    let textBody = update.text;
    if (textBody.length > targetLength) {
        textBody = textBody.substring(0, targetLength - 3) + '...';
    }
    
    switch (templateStyle) {
        case 'punchy':
            return `🔥 BigQuery [${update.type}]: ${textBody}\n\n👉 ${linkStr}`;
        case 'formal':
            return `Google Cloud BigQuery Update - ${dateStr}\n\n[${typeLabel}] ${textBody}\n\nDetails: ${linkStr}`;
        case 'default':
        default:
            return `BigQuery [${update.type}] (${dateStr}): ${textBody}\n\nRead more: ${linkStr}`;
    }
}

// Apply selected template
function applyTemplate(style) {
    state.currentTemplate = style;
    
    // Update template active buttons
    templateBtns.forEach(btn => {
        if (btn.getAttribute('data-template') === style) {
            btn.className = 'btn btn-xs btn-primary template-btn';
        } else {
            btn.className = 'btn btn-xs btn-secondary template-btn';
        }
    });
    
    if (state.selectedUpdate) {
        tweetTextarea.value = generateTweetText(state.selectedUpdate, style);
        updateCharCount();
    }
}

// Calculate Twitter-exact character length
function getTwitterLength(text) {
    // Regex matching urls (standard http/https links)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Twitter/X shortens all links using t.co to exactly 23 characters
    const textWithShortenedUrls = text.replace(urlRegex, "12345678901234567890123");
    return textWithShortenedUrls.length;
}

// Update UI character count details
function updateCharCount() {
    const text = tweetTextarea.value;
    const length = getTwitterLength(text);
    const remaining = 280 - length;
    
    charCountText.textContent = remaining;
    
    // Visual indicators
    if (remaining < 0) {
        charCountText.className = 'char-count-number danger';
        btnPublishTweet.disabled = true;
        btnPublishTweet.style.opacity = 0.5;
        btnPublishTweet.style.cursor = 'not-allowed';
    } else if (remaining <= 20) {
        charCountText.className = 'char-count-number warning';
        btnPublishTweet.disabled = false;
        btnPublishTweet.style.opacity = 1;
        btnPublishTweet.style.cursor = 'pointer';
    } else {
        charCountText.className = 'char-count-number';
        btnPublishTweet.disabled = false;
        btnPublishTweet.style.opacity = 1;
        btnPublishTweet.style.cursor = 'pointer';
    }
}

/* -------------------------------------------------------------
 * 5. EVENT LISTENERS SETUP
 * ------------------------------------------------------------- */
function setupEventListeners() {
    // Refresh Button Click
    refreshBtn.addEventListener('click', () => fetchNotes(true));
    
    // Retry Button Click
    retryBtn.addEventListener('click', () => fetchNotes(true));
    
    // Search Box Inputs
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (state.searchQuery.trim().length > 0) {
            clearSearch.style.display = 'inline-flex';
        } else {
            clearSearch.style.display = 'none';
        }
        filterAndRender();
    });
    
    // Clear Search Input
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearSearch.style.display = 'none';
        searchInput.focus();
        filterAndRender();
    });
    
    // Category Filter Clicks
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.currentFilter = btn.getAttribute('data-filter');
            
            // Render updates with header update
            const filterLabel = btn.childNodes[2] ? btn.childNodes[2].textContent.trim() : btn.textContent.trim();
            document.getElementById('feed-title').textContent = filterLabel;
            
            filterAndRender();
        });
    });
    
    // Textarea Changes
    tweetTextarea.addEventListener('input', updateCharCount);
    
    // Preset Template Button clicks
    templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-template');
            applyTemplate(style);
        });
    });
    
    // Copy Tweet to Clipboard
    btnCopyTweet.addEventListener('click', async () => {
        const text = tweetTextarea.value;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Tweet copied to clipboard!');
        } catch (err) {
            // Fallback for older browsers
            tweetTextarea.select();
            document.execCommand('copy');
            showToast('Tweet copied to clipboard!');
        }
    });
    
    // Publish Tweet (Opens Twitter intent in new tab)
    btnPublishTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
        showToast('Opening X intent...');
    });
}

/* -------------------------------------------------------------
 * 6. TOAST NOTIFICATION UTILITY
 * ------------------------------------------------------------- */
let toastTimeout;
function showToast(message, isError = false) {
    clearTimeout(toastTimeout);
    
    toastMessage.textContent = message;
    
    if (isError) {
        toast.style.borderLeft = '4px solid var(--color-issue)';
    } else {
        toast.style.borderLeft = '4px solid var(--color-feature)';
    }
    
    toast.style.display = 'flex';
    // Small delay to allow element displays for animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300); // Wait for transition fade
    }, 3000);
}
