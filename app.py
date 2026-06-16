import os
import time
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# Constants
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "feed_cache.xml"
CACHE_EXPIRY = 3600  # 1 hour

def fetch_feed(force=False):
    """
    Fetches the feed from the URL.
    Uses cached file if it exists and is not expired, unless force=True.
    """
    now = time.time()
    
    # Check cache validity
    if not force and os.path.exists(CACHE_FILE):
        mtime = os.path.getmtime(CACHE_FILE)
        if now - mtime < CACHE_EXPIRY:
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return f.read(), False # False means not freshly fetched
            except Exception as e:
                print(f"Error reading cache: {e}")

    # Fetch fresh data
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        xml_content = response.text
        
        # Save to cache
        try:
            with open(CACHE_FILE, 'w', encoding='utf-8') as f:
                f.write(xml_content)
        except Exception as e:
            print(f"Error writing cache: {e}")
            
        return xml_content, True # True means freshly fetched
    except Exception as e:
        print(f"Error fetching feed: {e}")
        # If fetch fails, try to fall back to expired cache
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return f.read(), False
            except Exception as cache_err:
                print(f"Failed to read backup cache: {cache_err}")
        raise e

def parse_feed_content(xml_content):
    """
    Parses the Atom XML feed and splits it into individual updates.
    """
    soup = BeautifulSoup(xml_content, 'xml')
    updates = []
    
    # Check for feed root and entry elements
    entries = soup.find_all('entry')
    for entry in entries:
        title_el = entry.find('title')
        updated_el = entry.find('updated')
        link_el = entry.find('link', rel='alternate') or entry.find('link')
        content_el = entry.find('content')
        
        date_str = title_el.text.strip() if title_el else "Unknown Date"
        updated_str = updated_el.text.strip() if updated_el else ""
        link_url = link_el.get('href', '') if link_el is not None else ""
        html_content = content_el.text if content_el else ""
        
        # Parse the HTML description inside each entry to separate multi-item updates
        content_soup = BeautifulSoup(html_content, 'html.parser')
        
        # Google release notes generally separate updates using h3 tags
        headers = content_soup.find_all(['h3', 'h4'])
        
        if not headers:
            # Fallback if no h3/h4 headers found
            text_desc = content_soup.get_text().strip()
            text_desc = " ".join(text_desc.split())
            
            # Update links to open in new tab and prepend GCP base domain if relative
            for a in content_soup.find_all('a', href=True):
                if a['href'].startswith('/'):
                    a['href'] = 'https://cloud.google.com' + a['href']
                a['target'] = '_blank'
                a['rel'] = 'noopener noreferrer'

            updates.append({
                'id': entry.find('id').text.strip() if entry.find('id') else date_str,
                'date': date_str,
                'updated': updated_str,
                'link': link_url,
                'type': 'Update',
                'html': str(content_soup),
                'text': text_desc
            })
        else:
            for idx, header in enumerate(headers):
                update_type = header.text.strip()
                
                # Gather siblings until next header
                siblings = []
                sibling = header.next_sibling
                while sibling and sibling.name not in ['h3', 'h4']:
                    siblings.append(sibling)
                    sibling = sibling.next_sibling
                
                # Render siblings to HTML
                sibling_htmls = []
                for s in siblings:
                    if s.name:
                        # Fix links
                        for a in s.find_all('a', href=True):
                            if a['href'].startswith('/'):
                                a['href'] = 'https://cloud.google.com' + a['href']
                            a['target'] = '_blank'
                            a['rel'] = 'noopener noreferrer'
                        sibling_htmls.append(str(s))
                    elif str(s).strip():
                        sibling_htmls.append(str(s).strip())
                
                update_html = "".join(sibling_htmls)
                
                # Plain text version for sharing
                sibling_soup = BeautifulSoup(update_html, 'html.parser')
                text_desc = sibling_soup.get_text().strip()
                text_desc = " ".join(text_desc.split())
                
                # Unique ID for UI selection
                entry_id = entry.find('id').text.strip() if entry.find('id') else date_str
                unique_id = f"{entry_id}#{idx}"
                
                updates.append({
                    'id': unique_id,
                    'date': date_str,
                    'updated': updated_str,
                    'link': link_url,
                    'type': update_type,
                    'html': update_html,
                    'text': text_desc
                })
                
    return updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    try:
        xml_content, fetched_fresh = fetch_feed(force=False)
        updates = parse_feed_content(xml_content)
        
        # Get cache age
        cache_time = os.path.getmtime(CACHE_FILE) if os.path.exists(CACHE_FILE) else time.time()
        last_updated_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache_time))
        
        return jsonify({
            'success': True,
            'updates': updates,
            'fetched_fresh': fetched_fresh,
            'last_updated': last_updated_time
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/refresh')
def refresh_notes():
    try:
        xml_content, fetched_fresh = fetch_feed(force=True)
        updates = parse_feed_content(xml_content)
        
        cache_time = os.path.getmtime(CACHE_FILE) if os.path.exists(CACHE_FILE) else time.time()
        last_updated_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache_time))
        
        return jsonify({
            'success': True,
            'updates': updates,
            'fetched_fresh': fetched_fresh,
            'last_updated': last_updated_time
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Default Flask port
    app.run(debug=True, host='127.0.0.1', port=5000)
