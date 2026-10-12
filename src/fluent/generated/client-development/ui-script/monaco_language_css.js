/**
 * ============================================================================
 * UI Script: monaco_language_css
 * ============================================================================
 * Purpose: CSS/SCSS completion providers for at-rules (@media, @font-face,
 * @keyframes, etc.) and their valid descriptors, for editors using the
 * 'css'/'scss' Monaco languages.
 *
 * Contains:
 *   - _atRules table — at-rule names, descriptions, MDN links, and each
 *     rule's valid inner descriptors
 *   - Completion provider for at-rule names (fires on '@')
 *   - Completion provider for descriptors inside a recognised at-rule block
 *   - global.MONACO_LANGUAGE_CSS.register(monacoInstance) — entry point
 * ============================================================================
 */
/* global monaco */
(function (global) {
    'use strict';

    if (global.MONACO_LANGUAGE_CSS) {
        return;
    }

    /* Descriptors prefixed with '@' are nested at-rules (Keyword kind); all others are Property kind. */
    var _atRules = [
        {
            name: '@charset',
            description:
                'Sets the character encoding for the style sheet. Must be the very first statement in the file, written as @charset "UTF-8"; with a double-quoted IANA encoding name. Ignored when the style sheet is embedded in HTML or has a non-CSS content type.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@charset',
            descriptors: [],
        },
        {
            name: '@color-profile',
            description:
                'Defines a named ICC color profile that can be referenced in the color() function. The profile name is a --custom-ident specified after the at-rule keyword, not a descriptor inside the block. Requires src to point to an ICC profile file.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@color-profile',
            descriptors: ['src', 'rendering-intent'],
        },
        {
            name: '@container',
            description:
                "Applies contained rules to elements whose nearest size or style container matches the query. The container must have container-type set. Query conditions test the container's size features (width, height, aspect-ratio, orientation) or style features, combined with and, or, not.",
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@container',
            descriptors: [
                'width',
                'min-width',
                'max-width',
                'height',
                'min-height',
                'max-height',
                'inline-size',
                'min-inline-size',
                'max-inline-size',
                'block-size',
                'min-block-size',
                'max-block-size',
                'aspect-ratio',
                'min-aspect-ratio',
                'max-aspect-ratio',
                'orientation',
                'and',
                'or',
                'not',
                'scroll-state',
            ],
        },
        {
            name: '@counter-style',
            description:
                'Defines a custom counter style referenced by list-style or the counter()/counters() functions. The counter name is set after the at-rule keyword. system defines the counting algorithm; symbols or additive-symbols supply the glyphs.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@counter-style',
            descriptors: [
                'system',
                'symbols',
                'additive-symbols',
                'negative',
                'prefix',
                'suffix',
                'range',
                'pad',
                'speak-as',
                'fallback',
            ],
        },
        {
            name: '@font-face',
            description:
                'Declares a custom typeface. The browser downloads the font from src and makes it available under the font-family name. Multiple @font-face blocks for the same family can cover different weights, styles, or unicode ranges. Variable fonts use font-variation-settings.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face',
            descriptors: [
                'font-family',
                'src',
                'font-weight',
                'font-style',
                'font-stretch',
                'font-display',
                'unicode-range',
                'font-variant',
                'font-feature-settings',
                'font-variation-settings',
                'size-adjust',
                'ascent-override',
                'descent-override',
                'line-gap-override',
            ],
        },
        {
            name: '@font-feature-values',
            description:
                'Maps author-defined names to font-specific glyph indices for use with font-variant-alternates. Write @font-feature-values FamilyName { @swash { name: index; } }. font-display controls how the font renders during loading.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@font-feature-values',
            descriptors: [
                'font-display',
                '@swash',
                '@annotation',
                '@ornaments',
                '@stylistic',
                '@styleset',
                '@character-variant',
                '@historical-forms',
            ],
        },
        {
            name: '@font-palette-values',
            description:
                "Overrides or extends a color font's built-in color palette. Requires a --custom-ident name and a font-family that supports COLRv0 or COLRv1 color palettes. base-palette selects the starting palette; override-colors replaces individual colour slots.",
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@font-palette-values',
            descriptors: ['font-family', 'base-palette', 'override-colors'],
        },
        {
            name: '@import',
            description:
                'Includes another style sheet. Must appear before all rules except @charset and @layer order declarations. Supports optional layer(), supports(), and media conditions after the URL: @import url() layer() supports() media;',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@import',
            descriptors: ['url', 'layer', 'supports', 'media'],
        },
        {
            name: '@keyframes',
            description:
                'Defines the waypoints of a CSS animation. Selectors are percentages (0%\u2013100%) or the keywords from (0%) and to (100%). Properties not listed at a stop are interpolated from the nearest surrounding stops.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes',
            descriptors: ['from', 'to'],
        },
        {
            name: '@layer',
            description:
                'Declares a named cascade layer. Rules in later-declared layers win over earlier ones; un-layered styles win over all layers. Use @layer a, b; to declare order, or @layer a { ... } to hold rules. Layers can be nested.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@layer',
            descriptors: [],
        },
        {
            name: '@media',
            description:
                'Applies contained rules only when one or more media queries match. Supports media types (screen, print, all, speech), range features (width, resolution), and discrete features (orientation, hover, prefers-color-scheme). Combine conditions with and, or, not, only.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@media',
            descriptors: [
                'all',
                'print',
                'screen',
                'speech',
                'and',
                'not',
                'only',
                'or',
                'width',
                'min-width',
                'max-width',
                'height',
                'min-height',
                'max-height',
                'aspect-ratio',
                'min-aspect-ratio',
                'max-aspect-ratio',
                'orientation',
                'resolution',
                'min-resolution',
                'max-resolution',
                'color',
                'min-color',
                'max-color',
                'color-gamut',
                'color-index',
                'min-color-index',
                'max-color-index',
                'display-mode',
                'dynamic-range',
                'environment-blending',
                'forced-colors',
                'grid',
                'hover',
                'any-hover',
                'inverted-colors',
                'monochrome',
                'min-monochrome',
                'max-monochrome',
                'overflow-block',
                'overflow-inline',
                'pointer',
                'any-pointer',
                'prefers-color-scheme',
                'prefers-contrast',
                'prefers-reduced-data',
                'prefers-reduced-motion',
                'prefers-reduced-transparency',
                'scan',
                'scripting',
                'update',
                'video-color-gamut',
                'video-dynamic-range',
            ],
        },
        {
            name: '@namespace',
            description:
                'Declares an XML namespace prefix used in CSS selectors. Mainly useful for XML documents (SVG, MathML inline in HTML). Must appear after @charset and @import and before all other at-rules and style rules.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@namespace',
            descriptors: [],
        },
        {
            name: '@page',
            description:
                "Modifies page boxes for printed output. Targets named pages or pseudo-classes (:first, :left, :right, :blank). Margin at-rules (@top-center, @bottom-right, etc.) place generated content in the printer's page margin areas.",
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@page',
            descriptors: [
                'size',
                'margin',
                'margin-top',
                'margin-right',
                'margin-bottom',
                'margin-left',
                'page-orientation',
                'marks',
                'bleed',
                '@top-left-corner',
                '@top-left',
                '@top-center',
                '@top-right',
                '@top-right-corner',
                '@bottom-left-corner',
                '@bottom-left',
                '@bottom-center',
                '@bottom-right',
                '@bottom-right-corner',
                '@left-top',
                '@left-middle',
                '@left-bottom',
                '@right-top',
                '@right-middle',
                '@right-bottom',
            ],
        },
        {
            name: '@property',
            description:
                'Registers a CSS custom property with an explicit type (syntax), inheritance flag (inherits), and initial-value. Enables animations and transitions on custom properties and prevents unwanted inheritance when inherits: false.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@property',
            descriptors: ['syntax', 'inherits', 'initial-value'],
        },
        {
            name: '@scope',
            description:
                'Limits rule reach to a subtree defined by a scoping root and optional scoping limit: @scope (.card) to (.content) { ... }. Scoped rules use proximity-based specificity rather than source order to resolve conflicts.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@scope',
            descriptors: [],
        },
        {
            name: '@starting-style',
            description:
                'Provides initial values for CSS transitions on elements that are first rendered or transition from display: none. Without @starting-style there is no before-change style, so the transition cannot start.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style',
            descriptors: [],
        },
        {
            name: '@supports',
            description:
                'Applies rules only when the browser supports the tested CSS declaration, selector, or font capability. Combine conditions with and, or, not. Use selector() to test selector support; font-tech() and font-format() test font technology support.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@supports',
            descriptors: ['not', 'and', 'or', 'selector', 'font-tech', 'font-format'],
        },
        {
            name: '@view-transition',
            description:
                'Opts a document into cross-document view transitions for same-origin navigations. Set navigation: auto to activate the transition when the user navigates to or from the page.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@view-transition',
            descriptors: ['navigation'],
        },
        {
            name: '@position-try',
            description:
                'Defines a named position-try fallback option for anchor-positioned elements. When an anchored element overflows its containing block, the browser tries each fallback listed in position-try-fallbacks in order.',
            mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@position-try',
            descriptors: [],
        },
    ];

    /* Quick lookup: '@rule-name' -> rule object */
    var _atRuleMap = {};
    _atRules.forEach(function (rule) {
        _atRuleMap[rule.name] = rule;
    });

    var _registered = false;
    var _scssTokenizerSet = false;

    function _setupScssTokenizer(monacoInstance) {
        if (_scssTokenizerSet) {
            return;
        }
        _scssTokenizerSet = true;

        monacoInstance.languages.setLanguageConfiguration('scss', {
            wordPattern: /(#?-?[_a-zA-Z][_a-zA-Z0-9-]*)|\d+[_a-zA-Z][_a-zA-Z0-9-]*/,
            comments: { lineComment: '//', blockComment: ['/*', '*/'] },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
            ],
        });

        monacoInstance.languages.setMonarchTokensProvider('scss', {
            defaultToken: '',
            tokenPostfix: '.scss',

            tokenizer: {
                root: [
                    [/\/\/.*$/, 'comment'],
                    [/\/\*/, { token: 'comment', next: '@blockcomment' }],
                    [/"([^"\\]|\\.)*"/, 'string'],
                    [/'([^'\\]|\\.)*'/, 'string'],
                    [/\$[\w-]+/, 'type.identifier'],
                    [/#{/, { token: 'keyword.operator', next: '@interpolation' }],
                    [
                        /@(?:keyframes|-webkit-keyframes|-moz-keyframes|-o-keyframes)\b/,
                        { token: 'keyword', next: '@keyframesName' },
                    ],
                    [
                        /@(?:mixin|include|extend|function|return|if|else\s+if|else|for|each|while|debug|warn|error|use|forward|import|charset|namespace|media|supports|page|font-face|layer|container)\b/,
                        'keyword',
                    ],
                    [/!(?:important|default|global|optional)\b/, 'keyword'],
                    [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'],
                    [
                        /-?(?:\d+\.?\d*|\.\d+)(?:em|ex|ch|rem|vw|vh|vmin|vmax|cqw|cqh|fr|px|pt|pc|in|cm|mm|deg|rad|turn|grad|s|ms|Hz|kHz|dpi|dpcm|dppx|%)?(?=[\s,;{}()\[\]])/,
                        'number',
                    ],
                    [/[\w-]+(?=\s*\()/, 'support.function'],
                    [/[\w-]+(?=\s*:(?!:))/, 'attribute.name'],
                    [/::[:\w-]+/, 'tag'],
                    [/:[:\w-]+/, 'tag'],
                    [/#[\w-]+/, 'tag'],
                    [/\.[\w-]+/, 'tag'],
                    [/[*&%]/, 'keyword.operator'],
                    [
                        /\b(?:true|false|null|and|or|not|in|from|through|to|auto|none|inherit|unset|initial|revert)\b/,
                        'keyword',
                    ],
                    [/[{}]/, 'delimiter.curly'],
                    [/[\[\]]/, 'delimiter.square'],
                    [/[()]/, 'delimiter.parenthesis'],
                    [/[;,:]/, 'delimiter'],
                ],

                blockcomment: [
                    [/\*\//, { token: 'comment', next: '@pop' }],
                    [/./, 'comment'],
                ],

                keyframesName: [
                    [/\s+/, ''],
                    [/[\w-]+/, { token: 'type.identifier', next: '@keyframesBody' }],
                    [/[{]/, { token: 'delimiter.curly', next: '@pop' }],
                    [/./, '', '@pop'],
                ],

                keyframesBody: [
                    [/\s+/, ''],
                    [/[{]/, { token: 'delimiter.curly', next: '@popall' }],
                    [/./, '', '@popall'],
                ],

                interpolation: [
                    [/}/, { token: 'keyword.operator', next: '@pop' }],
                    [/\$[\w-]+/, 'identifier'],
                    { include: '@root' },
                ],
            },
        });
    }

    /**
     * Scans backwards through the text before the cursor to find which @rule block
     * the cursor currently sits inside, if any.
     *
     * Tracks unmatched opening braces: when depth reaches zero on a '{', the text
     * preceding that brace is scanned for an @rule name.
     *
     * @param {Object} model    - Monaco ITextModel.
     * @param {Object} position - Monaco IPosition {lineNumber, column}.
     * @returns {string|null} The at-rule name (e.g. '@font-face'), or null.
     */
    function _detectAtRuleContext(model, position) {
        var text = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        });

        var depth = 0;
        for (var i = text.length - 1; i >= 0; i--) {
            var ch = text[i];
            if (ch === '}') {
                depth++;
            } else if (ch === '{') {
                if (depth === 0) {
                    /* Nearest unmatched '{' found — look backwards for an @rule name */
                    var before = text.slice(0, i).replace(/\s+$/, '');
                    var m = before.match(/@([\w-]+)[^{@]*$/);
                    if (m) {
                        return '@' + m[1];
                    }
                    return null;
                }
                depth--;
            }
        }
        return null;
    }

    function _getMediaPreludeContext(model, position) {
        var lineText = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        });

        var mediaMatch = lineText.match(/@media\b([^{}]*)$/);
        if (!mediaMatch) {
            return null;
        }

        var prelude = mediaMatch[1] || '';
        var openParen = prelude.lastIndexOf('(');
        var closeParen = prelude.lastIndexOf(')');
        var inParen = openParen !== -1 && openParen > closeParen;
        var typedMatch = lineText.match(/([\w-]*)$/);
        var typed = typedMatch ? typedMatch[1] : '';

        if (!inParen && !/\b(?:and|or|not|only|screen|print|all|speech)\s+[\w-]*$/.test(prelude)) {
            return null;
        }

        return {
            typed: typed,
            range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - typed.length,
                endColumn: position.column,
            },
        };
    }

    /**
     * Registers CSS/SCSS completion providers for at-rule names and their descriptors.
     * @param {Object} monacoInstance - The global monaco namespace object.
     */
    function register(monacoInstance) {
        if (_registered) {
            return;
        }
        _registered = true;

        _setupScssTokenizer(monacoInstance);

        ['css', 'scss'].forEach(function (lang) {
            monacoInstance.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: ['@'],
                provideCompletionItems: function (model, position) {
                    var lineText = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    });

                    var atMatch = lineText.match(/@([\w-]*)$/);
                    if (!atMatch) {
                        return { suggestions: [] };
                    }

                    var typed = atMatch[1] || '';
                    var range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: position.column - typed.length,
                        endColumn: position.column,
                    };

                    return {
                        suggestions: _atRules.map(function (rule) {
                            return {
                                label: rule.name,
                                kind: monacoInstance.languages.CompletionItemKind.Keyword,
                                detail: rule.description,
                                documentation: {
                                    value: rule.description + '\n\n[MDN Reference](' + rule.mdn + ')',
                                },
                                insertText: rule.name.slice(1),
                                range: range,
                            };
                        }),
                    };
                },
            });

            monacoInstance.languages.registerCompletionItemProvider(lang, {
                provideCompletionItems: function (model, position) {
                    var ctx = _detectAtRuleContext(model, position);
                    if (!ctx) {
                        return { suggestions: [] };
                    }

                    var ruleInfo = _atRuleMap[ctx];
                    if (!ruleInfo || !ruleInfo.descriptors.length) {
                        return { suggestions: [] };
                    }

                    var lineText = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    });

                    var trimmed = lineText.replace(/^\s+/, '');
                    var range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: position.column - trimmed.length,
                        endColumn: position.column,
                    };

                    return {
                        suggestions: ruleInfo.descriptors.map(function (desc) {
                            var isAtRule = desc.charAt(0) === '@';
                            return {
                                label: desc,
                                kind: isAtRule
                                    ? monacoInstance.languages.CompletionItemKind.Keyword
                                    : monacoInstance.languages.CompletionItemKind.Property,
                                /* Nested at-rules omit the already-matched '@'; properties append ': ' for the value. */
                                insertText: isAtRule ? desc.slice(1) : desc + ': ',
                                range: range,
                            };
                        }),
                    };
                },
            });

            monacoInstance.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: ['(', '-', ' '],
                provideCompletionItems: function (model, position) {
                    var ctx = _getMediaPreludeContext(model, position);
                    var ruleInfo = _atRuleMap['@media'];
                    if (!ctx || !ruleInfo || !ruleInfo.descriptors.length) {
                        return { suggestions: [] };
                    }

                    return {
                        suggestions: ruleInfo.descriptors.map(function (desc) {
                            var isKeyword = /^(?:and|or|not|only|all|print|screen|speech)$/.test(desc);
                            var insertText = desc;
                            if (!isKeyword && /^min-|^max-|^[\w-]+$/.test(desc)) {
                                insertText = desc;
                            }

                            return {
                                label: desc,
                                kind: isKeyword
                                    ? monacoInstance.languages.CompletionItemKind.Keyword
                                    : monacoInstance.languages.CompletionItemKind.Property,
                                insertText: insertText,
                                range: ctx.range,
                                detail: '@media feature',
                                filterText: desc,
                                sortText: isKeyword ? 'a_' + desc : 'b_' + desc,
                            };
                        }),
                    };
                },
            });
        });

        ['css', 'scss'].forEach(function (lang) {
            monacoInstance.languages.registerHoverProvider(lang, {
                provideHover: function (model, position) {
                    var lineText = model.getLineContent(position.lineNumber);
                    var col = position.column - 1; // 0-based

                    var start = col;

                    if (lineText[start] === '@') {
                        /* cursor is directly on the @ sign */
                    } else if (/[\w-]/.test(lineText[start])) {
                        /* cursor is on the rule name — scan left to find @ */
                        while (start > 0 && /[\w-]/.test(lineText[start - 1])) {
                            start--;
                        }
                        if (start === 0 || lineText[start - 1] !== '@') {
                            return null;
                        }
                        start--; /* include the @ */
                    } else {
                        return null;
                    }

                    /* scan right past the rule name */
                    var end = start + 1;
                    while (end < lineText.length && /[\w-]/.test(lineText[end])) {
                        end++;
                    }

                    var word = lineText.slice(start, end);
                    var rule = _atRuleMap[word];
                    if (!rule) {
                        return null;
                    }

                    return {
                        range: new monacoInstance.Range(position.lineNumber, start + 1, position.lineNumber, end + 1),
                        contents: [
                            { value: '**' + rule.name + '**' },
                            { value: rule.description },
                            { value: '[MDN Reference](' + rule.mdn + ')' },
                        ],
                    };
                },
            });
        });
    }

    global.MONACO_LANGUAGE_CSS = { register: register };
})(typeof window !== 'undefined' ? window : globalThis);
