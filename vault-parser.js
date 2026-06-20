/**
 * BAC 2027 - Advanced Vault Parser
 * 
 * Parses Markdown files to extract:
 *  - Wikilinks [[target]] (with aliases and sections)
 *  - Tags #tag (with nested support)
 *  - Frontmatter YAML
 *  - Embeds ![[target]]
 *  - Headings
 *  - Yearly plan tables (lessons only, filtering holidays/exams)
 */

const matter = require('gray-matter');
const path = require('path');
const fs = require('fs');

const VAULT_PATH = path.resolve(__dirname, '..');

// Regex patterns
const WIKILINK_PATTERN = /\[\[([^\[\]]+)\]\]/g;
const EMBED_PATTERN = /!\[\[([^\[\]]+)\]\]/g;
const TAG_PATTERN = /(?<=\s|^)#([a-zA-Z0-9_\/\-]+)/g;
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

// ──────────────────────────────────────────────────────
//  Wikilink
// ──────────────────────────────────────────────────────

function parseWikiLink(raw) {
    raw = raw.trim();
    let target = raw;
    let alias = null;
    let section = null;

    let aliasMatch = raw.match(/\|(.+)$/);
    if (aliasMatch) {
        alias = aliasMatch[1].trim();
        target = raw.substring(0, aliasMatch.index).trim();
    }

    let sectionMatch = target.match(/([#^][^[\]]+)$/);
    if (sectionMatch) {
        section = sectionMatch[1];
        target = target.substring(0, sectionMatch.index).trim();
    }

    return { target, alias, section };
}

// ──────────────────────────────────────────────────────
//  Frontmatter
// ──────────────────────────────────────────────────────

function parseFrontmatter(content) {
    const fm = matter(content);
    return {
        data: fm.data || {},
        content: fm.content,
        excerpt: fm.excerpt || '',
        isEmpty: !fm.data || Object.keys(fm.data).length === 0
    };
}

// ──────────────────────────────────────────────────────
//  Tags
// ──────────────────────────────────────────────────────

function extractTagsFromText(text) {
    const tags = new Set();
    let match;
    while ((match = TAG_PATTERN.exec(text)) !== null) {
        tags.add(match[1]);
    }
    return Array.from(tags);
}

// ──────────────────────────────────────────────────────
//  Wikilinks with line & column
// ──────────────────────────────────────────────────────

function extractWikilinksFromText(text) {
    const links = [];
    let match;
    while ((match = WIKILINK_PATTERN.exec(text)) !== null) {
        const parsed = parseWikiLink(match[1]);
        links.push({
            raw: match[0],
            target: parsed.target,
            alias: parsed.alias,
            section: parsed.section,
            line: text.substring(0, match.index).split('\n').length,
            col: match.index - text.lastIndexOf('\n', match.index) - 1
        });
    }
    return links;
}

function extractEmbedsFromText(text) {
    const embeds = [];
    let match;
    while ((match = EMBED_PATTERN.exec(text)) !== null) {
        const parsed = parseWikiLink(match[1]);
        embeds.push({
            raw: match[0],
            target: parsed.target,
            section: parsed.section,
            line: text.substring(0, match.index).split('\n').length,
            col: match.index - text.lastIndexOf('\n', match.index) - 1
        });
    }
    return embeds;
}

// ──────────────────────────────────────────────────────
//  Headings
// ──────────────────────────────────────────────────────

function extractHeadingsFromText(text) {
    const headings = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^#{1,6}\s/.test(trimmed)) {
            headings.push({
                line: i + 1,
                level: trimmed.match(/^#+/)[0].length,
                title: trimmed.replace(/^#+\s/, '').trim()
            });
        }
    }
    return headings;
}

// ──────────────────────────────────────────────────────
//  Clean & Filter Utilities
// ──────────────────────────────────────────────────────

/**
 * Remove Markdown formatting and HTML entities from text
 */
function cleanLessonName(text) {
    if (typeof text !== 'string') return '';
    let result = text;
    result = result.replace(/\*\*(.+?)\*\*/g, '$1');
    result = result.replace(/\*(.+?)\*/g, '$1');
    result = result.replace(/_(.+?)_/g, '$1');
    result = result.replace(/~~(.+?)~~/g, '$1');
    result = result.replace(/`(.+?)`/g, '$1');
    result = result.replace(/<[^>]*>/g, '');
    result = result.replace(/&#x2F;/gi, '/');
    result = result.replace(/&#x27;/gi, "'");
    result = result.replace(/&/gi, '&');
    result = result.replace(/</gi, '<');
    result = result.replace(/>/gi, '>');
    result = result.replace(/"/gi, '"');
    result = result.trim();
    return result;
}

/**
 * Check if a table row should be filtered out (holidays, exams, diagnostics, pedagogical treatments)
 */
function isRowFiltered(cells) {
    if (!cells || cells.length === 0) return true;
    
    const combined = cells.join(' ').trim();
    
    // Empty row
    if (!combined || combined === '' || combined === '-') return true;
    
    // Holidays
    if (/عطلة/i.test(combined)) return true;
    
    // Exams and tests
    if (/اختبار/i.test(combined)) return true;
    if (/امتحان/i.test(combined)) return true;
    
    // Diagnostic evaluation
    if (/تشخيص/i.test(combined)) return true;
    if (/تقويم تشخيصي/i.test(combined)) return true;
    
    // Pedagogical treatment
    if (/معالجة بيداغوجية/i.test(combined)) return true;
    if (/معالجة/i.test(combined) && /بيداغوج/i.test(combined)) return true;
    
    // Header rows in tables
    if (/^(الأسبوع|التاريخ|المحور|الموضوع|الحجم الساعي|week|date|topic|lesson|hours|session|time|content|chapter)$/i.test(cells[0])) return true;
    if (cells.some(c => /^(الأسبوع|التاريخ|المحور|الموضوع|الحجم)$/i.test(c.trim()))) return true;
    
    // Table separators
    if (combined.includes('---') && combined.includes('|')) return true;
    
    // Pure numbers or dates
    if (/^[\d\-\/\\s]+$/.test(combined.trim())) return true;
    
    // Short meaningless text
    if (combined.trim().length < 2) return true;
    
    return false;
}

/**
 * Check if lesson name is meaningful (not a date, single letter, etc.)
 */
function isMeaningfulLesson(name) {
    if (!name || name.length < 3) return false;
    if (name.length > 150) return false; // Too long, likely a paragraph
    if (/^\d+\s*س$/.test(name)) return false; // "6س" pattern (hours only)
    if (/^[\d\-\/\s]+$/.test(name)) return false; // Pure date or numbers
    if (/^[\u0627-\u064a]{1,2}$/.test(name)) return false; // Single Arabic letter
    if (/^http/.test(name)) return false; // URL
    return true;
}

// ──────────────────────────────────────────────────────
//  Yearly Plan Parser (IMPROVED v2)
// ──────────────────────────────────────────────────────

/**
 * Parse yearly plan content - extracts only lessons, filtering out holidays, exams, etc.
 * Supports: tables (Markdown), bullet lists, and plain section-based lists.
 */
function parseYearlyPlan(content) {
    try {
        if (!content || typeof content !== 'string') return [];
        const lines = content.split('\n');
        const chapters = [];
        let currentChapter = null;
        let inTableSection = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // ==================== SECTION HEADERS ====================
            // Support: ## Title, ### Title
            if (/^#{1,4}\s/.test(trimmed)) {
                // Save previous chapter
                if (currentChapter && currentChapter.lessons.length > 0) {
                    chapters.push(currentChapter);
                }
                
                const headerText = trimmed.replace(/^#{1,4}\s+/, '').trim();
                // Skip main title headers (year, subject info)
                if (/^(الشعبة|السنة الدراسية|المصدر|جدول|قائمة المتابعة|🗺️|✅)/i.test(headerText)) {
                    currentChapter = null;
                    continue;
                }
                
                currentChapter = {
                    name: cleanLessonName(headerText),
                    lessons: [],
                    completedCount: 0,
                    totalCount: 0
                };
                continue;
            }

            // ==================== TABLE ROWS ====================
            // Format: | week | date | topic | lesson_name | hours |
            if (/^\|.+\|$/.test(trimmed) && (trimmed.match(/\|/g) || []).length >= 3) {
                const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
                
                // Skip table header separators like |---|---|
                if (cells.length === 1 && cells[0].includes('---')) continue;
                
                // Check if this row should be filtered
                if (isRowFiltered(cells)) continue;
                
                // Need a chapter to put lessons in
                if (!currentChapter) {
                    currentChapter = {
                        name: 'عام',
                        lessons: [],
                        completedCount: 0,
                        totalCount: 0
                    };
                }
                
                // Extract lesson name from the appropriate column
                let lessonName = '';
                let chapterName = '';
                
                if (cells.length >= 4) {
                    // 5+ columns: [week, date, topic, lesson, hours]
                    chapterName = cells[2]; // topic column
                    lessonName = cells[3];  // lesson column
                } else if (cells.length === 3) {
                    lessonName = cells[1];
                } else if (cells.length === 2) {
                    lessonName = cells[1];
                }
                
                lessonName = cleanLessonName(lessonName);
                chapterName = cleanLessonName(chapterName);
                
                // If we have a chapter name in the cell AND it's different from current, create new chapter
                if (chapterName && chapterName.length > 2 && chapterName !== currentChapter.name) {
                    if (currentChapter && currentChapter.lessons.length > 0) {
                        chapters.push(currentChapter);
                    }
                    currentChapter = {
                        name: chapterName,
                        lessons: [],
                        completedCount: 0,
                        totalCount: 0
                    };
                }
                
                if (isMeaningfulLesson(lessonName)) {
                    currentChapter.lessons.push({
                        name: cleanLessonName(lessonName),
                        status: 'not_started'
                    });
                    currentChapter.totalCount++;
                }
                continue;
            }

            // ==================== BULLET LISTS (Checkboxes) ====================
            const listMatch = trimmed.match(/^([\-\*\+]|\d+[\.\)])\s+(.+)/);
            if (!listMatch) continue;
            
            const contentPart = listMatch[2].trim();
            
            if (contentPart.length < 3 || contentPart.length > 200) continue;
            if (/^[\d\s\-/]+$/.test(contentPart) || contentPart.startsWith('http')) continue;
            
            // Need a chapter
            if (!currentChapter) {
                currentChapter = {
                    name: 'عام',
                    lessons: [],
                    completedCount: 0,
                    totalCount: 0
                };
            }
            
            let lessonName = null;
            let status = 'not_started';
            
            // Pattern 1: Checkbox [ ], [x], [/], [~]
            const match1 = contentPart.match(/^\[([ x~/])\]\s+(.+)/);
            if (match1) {
                const checkboxMap = { ' ': 'not_started', 'x': 'completed', '/': 'in_progress', '~': 'review_needed' };
                status = checkboxMap[match1[1]] || 'not_started';
                lessonName = match1[2].trim();
            } else {
                // Pattern 2: Plain text
                lessonName = contentPart;
            }
            
            if (lessonName && lessonName.length > 2) {
                const cleanName = cleanLessonName(lessonName);
                if (isMeaningfulLesson(cleanName)) {
                    currentChapter.lessons.push({
                        name: cleanName,
                        status: status
                    });
                    currentChapter.totalCount++;
                    if (status === 'completed') currentChapter.completedCount++;
                }
            }
        }

        // Add last chapter
        if (currentChapter && currentChapter.lessons.length > 0) {
            chapters.push(currentChapter);
        }

        // Remove duplicate lessons within the same chapter
        for (const chapter of chapters) {
            const seen = new Set();
            chapter.lessons = chapter.lessons.filter(lesson => {
                const key = lesson.name.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            chapter.totalCount = chapter.lessons.length;
            chapter.completedCount = chapter.lessons.filter(l => l.status === 'completed').length;
        }

        return chapters;
    } catch (e) {
        console.error('VaultParser.parseYearlyPlan error:', e);
        return [];
    }
}

// ──────────────────────────────────────────────────────
//  Daily Note Parser
// ──────────────────────────────────────────────────────

function parseDailyNote(content) {
    try {
        if (!content || typeof content !== 'string') {
            return {
                subjects: [], totalMinutes: 0, productivityScore: 5,
                tasksCompleted: [], tomorrowGoals: [], streak: 0
            };
        }
        const result = {
            subjects: [], totalMinutes: 0, productivityScore: 5,
            tasksCompleted: [], tomorrowGoals: [], streak: 0
        };
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!yamlMatch) return result;
        const yaml = yamlMatch[1];
        try {
            const prodMatch = yaml.match(/productivity_score:\s*([\d.]+)/);
            if (prodMatch) result.productivityScore = Math.min(10, parseFloat(prodMatch[1]));
        } catch (e) { /* ignore */ }
        try {
            const minMatch = yaml.match(/total_study_minutes:\s*(\d+)/);
            if (minMatch) result.totalMinutes = parseInt(minMatch[1]) || 0;
        } catch (e) { /* ignore */ }
        try {
            const streakMatch = yaml.match(/streak:\s*(\d+)/);
            if (streakMatch) result.streak = parseInt(streakMatch[1]) || 0;
        } catch (e) { /* ignore */ }
        try {
            const subjectsSection = yaml.match(/subjects_studied:\n((?:\s+- .*\n?)*)/);
            if (subjectsSection) {
                const subjectLines = subjectsSection[1].split('\n');
                for (const sl of subjectLines) {
                    const nameMatch = sl.match(/name:\s*(.+)/);
                    if (nameMatch) {
                        result.subjects.push({
                            name: nameMatch[1].trim(),
                            minutes: 0,
                            lessons: []
                        });
                    }
                }
            }
        } catch (e) { /* ignore */ }
        try {
            const tasksSection = yaml.match(/tasks_completed:\n((?:\s+- .*\n?)*)/);
            if (tasksSection) {
                const taskLines = tasksSection[1].split('\n');
                for (const tl of taskLines) {
                    const taskMatch = tl.match(/-\s*"(.+)"\s*$/);
                    if (taskMatch) {
                        result.tasksCompleted.push(taskMatch[1].trim());
                    }
                }
            }
        } catch (e) { /* ignore */ }
        return result;
    } catch (e) {
        console.error('VaultParser.parseDailyNote error:', e);
        return {
            subjects: [], totalMinutes: 0, productivityScore: 5,
            tasksCompleted: [], tomorrowGoals: [], streak: 0
        };
    }
}

function updateLessonStatus(content, lessonName, newStatus) {
    try {
        if (!content || typeof content !== 'string') return content;
        const STATUS_MAP = {
            'not_started': { symbol: '❌', md: '- [ ]', label: 'لم يبدأ' },
            'in_progress': { symbol: '⏳', md: '- [/]', label: 'قيد الدراسة' },
            'completed': { symbol: '✔', md: '- [x]', label: 'تم' },
            'review_needed': { symbol: '🔁', md: '- [~]', label: 'يحتاج مراجعة' },
        };
        const statusInfo = STATUS_MAP[newStatus];
        if (!statusInfo) return content;
        const lines = content.split('\n');
        const newLines = lines.map(line => {
            const trimmed = line.trim();
            const checkboxPattern = /^(- \[.\])\s+(.+)/;
            const checkboxMatch = trimmed.match(checkboxPattern);
            if (checkboxMatch && checkboxMatch[2].trim() === lessonName) {
                const indent = line.match(/^\s*/)[0];
                return `${indent}${statusInfo.md} ${lessonName}`;
            }
            const symbolStartPattern = /^(- [❌⏳✔🔁])\s+(.+)/;
            const symbolStartMatch = trimmed.match(symbolStartPattern);
            if (symbolStartMatch && symbolStartMatch[2].trim() === lessonName) {
                const indent = line.match(/^\s*/)[0];
                return `${indent}${statusInfo.symbol} ${lessonName}`;
            }
            const symbolEndPattern = /^(- .+?)\s*[❌⏳✔🔁]$/;
            const symbolEndMatch = trimmed.match(symbolEndPattern);
            if (symbolEndMatch && symbolEndMatch[1].substring(2).trim() === lessonName) {
                const indent = line.match(/^\s*/)[0];
                return `${indent}${lessonName} ${statusInfo.symbol}`;
            }
            const plainPattern = /^(- )(.+)/;
            const plainMatch = trimmed.match(plainPattern);
            if (plainMatch && plainMatch[2].trim() === lessonName) {
                const indent = line.match(/^\s*/)[0];
                return `${indent}${statusInfo.md} ${lessonName}`;
            }
            return line;
        });
        return newLines.join('\n');
    } catch (e) {
        console.error('VaultParser.updateLessonStatus error:', e);
        return content;
    }
}

// ──────────────────────────────────────────────────────
//  Main Parsers
// ──────────────────────────────────────────────────────

function parseMarkdownFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(VAULT_PATH, filePath);
        const fileId = path.basename(filePath, '.md');

        const fmResult = parseFrontmatter(content);
        const body = fmResult.content;

        return {
            fileId,
            path: relativePath,
            absolutePath: filePath,
            frontmatter: fmResult.data,
            wikilinks: extractWikilinksFromText(content),
            embedTargets: extractEmbedsFromText(body).map(e => e.target),
            wikilinkTargets: extractWikilinksFromText(content).map(l => l.target),
            tags: extractTagsFromText(body),
            headings: extractHeadingsFromText(content),
            firstParagraph: body.split('\n').find(l => l.trim().length > 20)?.trim() || '',
            wordCount: body.split(/\s+/).filter(Boolean).length,
            stat: fs.statSync(filePath),
            lastModified: fs.statSync(filePath).mtime.toISOString()
        };
    } catch (e) {
        console.error('VaultParser.parseMarkdownFile error for ' + filePath + ':', e.message);
        return null;
    }
}

function parseVault(dirPath) {
    if (dirPath === undefined) dirPath = VAULT_PATH;
    const results = [];

    function walk(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        walk(fullPath);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    const parsed = parseMarkdownFile(fullPath);
                    if (parsed) results.push(parsed);
                }
            }
        } catch (e) {
            console.error('VaultParser.walk error in ' + dir + ':', e.message);
        }
    }

    walk(dirPath);
    return results;
}

function buildKnowledgeGraph(vaultResults) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    for (const file of vaultResults) {
        nodes.push({
            id: file.fileId,
            type: 'file',
            path: file.path,
            frontmatter: file.frontmatter,
            tags: file.tags,
            wordCount: file.wordCount,
            lastModified: file.lastModified
        });
        nodeMap.set(file.fileId, file);

        for (const tag of file.tags) {
            const tagId = '#' + tag;
            if (!nodeMap.has(tagId)) {
                nodes.push({
                    id: tagId,
                    type: 'tag',
                    name: tag
                });
                nodeMap.set(tagId, null);
            }
            edges.push({
                source: file.fileId,
                target: tagId,
                relation: 'tag'
            });
        }
    }

    for (const file of vaultResults) {
        for (const target of file.wikilinkTargets) {
            const cleanTarget = target.replace(/\.(md|canvas|base)$/, '');
            if (nodeMap.has(cleanTarget)) {
                edges.push({
                    source: file.fileId,
                    target: cleanTarget,
                    relation: 'wikilink'
                });
            } else {
                if (!nodes.find(n => n.id === cleanTarget)) {
                    nodes.push({
                        id: cleanTarget,
                        type: 'file',
                        path: null,
                        frontmatter: {},
                        tags: [],
                        wordCount: 0,
                        unresolved: true
                    });
                }
                edges.push({
                    source: file.fileId,
                    target: cleanTarget,
                    relation: 'wikilink'
                });
            }
        }
    }

    return { nodes, edges };
}

function getBacklinks(fileId, vaultResults) {
    return vaultResults
        .filter(f => f.wikilinkTargets.some(t => t.replace(/\.(md|canvas|base)$/, '') === fileId))
        .map(f => ({
            fileId: f.fileId,
            path: f.path,
            tags: f.tags,
            firstParagraph: f.firstParagraph
        }));
}

function getOutgoingLinks(fileId, vaultResults) {
    const f = vaultResults.find(f => f.fileId === fileId);
    if (!f) return [];
    return f.wikilinkTargets.map(t => ({
        target: t.replace(/\.(md|canvas|base)$/, ''),
        raw: t,
        alias: f.wikilinks.find(l => l.target === t)?.alias || null,
        section: f.wikilinks.find(l => l.target === t)?.section || null
    }));
}

module.exports = {
    parseMarkdownFile,
    parseVault,
    buildKnowledgeGraph,
    getBacklinks,
    getOutgoingLinks,
    parseFrontmatter,
    extractTagsFromText,
    extractWikilinksFromText,
    extractEmbedsFromText,
    extractHeadingsFromText,
    parseYearlyPlan,
    parseDailyNote,
    updateLessonStatus,
    cleanLessonName,
    VAULT_PATH
};