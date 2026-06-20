/**
 * BAC 2027 - مشترك Utilities
 */

function sanitizeHTML(text) {
    if (typeof text !== 'string') return '';
    var escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
    };
    return text.replace(/[&<>"'\/]/g, function(char) { return escapeMap[char]; });
}

// ✅ Safe: يستخدم textContent لمنع XSS
function setSafeHTML(element, html) {
    if (!element) return;
    element.textContent = html;
}

function setTextContent(element, text) {
    if (!element) return;
    element.textContent = text;
}

// ⚠️ استخدم هذه فقط مع المحتوى الموثوق (Trusted Content)
function setInnerHTML(element, html) {
    if (!element) return;
    element.innerHTML = html;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

if (typeof window !== 'undefined') {
    window.sanitizeHTML = sanitizeHTML;
    window.setSafeHTML = setSafeHTML;
    window.setTextContent = setTextContent;
    window.setInnerHTML = setInnerHTML;
    window.escapeHtml = escapeHtml;
}