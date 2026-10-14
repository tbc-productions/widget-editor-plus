// Pure computation for the Credit+ browser worker.
var CreditAnalysis = function (limits, whitespace) {
    this.limits = limits;
    this.whitespace = ['none', 'all', 'changes', 'eol'].indexOf(whitespace) === -1 ? 'all' : whitespace;
    this.previous = Object.create(null);
    this.origins = [];
    this.updates = [];
    this.warnings = [];
};
CreditAnalysis.prototype = {
    keys: function (lines) {
        // A snapshot can be compared again with a different whitespace setting.
        if (lines.creditWhitespace !== this.whitespace || !lines.creditKeys) {
            var mode = this.whitespace;
            lines.creditKeys = lines.map(function (line) {
                if (mode === 'all') return line.replace(/\s/g, '');
                if (mode === 'none') return line;
                line = line.replace(/\s+$/, '');
                return mode === 'changes' ? line.replace(/\s+/g, ' ') : line;
            });
            lines.creditWhitespace = mode;
        }
        return lines.creditKeys;
    },
    match: function (oldLines, newLines, budget, nesting) {
        var a = nesting ? oldLines : this.keys(oldLines),
            b = nesting ? newLines : this.keys(newLines);
        var n = a.length,
            m = b.length,
            map = [],
            used = [],
            i,
            j;
        var begin = 0,
            oldEnd = n,
            newEnd = m;
        while (begin < oldEnd && begin < newEnd && a[begin] === b[begin]) {
            map[begin] = begin;
            used[begin] = true;
            begin++;
        }
        while (oldEnd > begin && newEnd > begin && a[oldEnd - 1] === b[newEnd - 1]) {
            oldEnd--;
            newEnd--;
            map[newEnd] = oldEnd;
            used[oldEnd] = true;
        }
        if (begin === n && begin === m) return map;
        if (n > this.limits.max_lines || m > this.limits.max_lines) {
            map.partial = true;
            return map;
        }
        if (!n || !m) return map;
        var positions = Object.create(null);
        for (i = begin; i < oldEnd; i++) (positions[a[i]] || (positions[a[i]] = [])).push(i);
        var chains = [],
            exhausted = false,
            chain = null,
            pairs = 0;
        for (j = begin; j < newEnd; j++) pairs += (positions[b[j]] || []).length;
        // Patience anchors split around unique lines; bounded nesting protects against adversarial histories.
        var anchors = [];
        if (pairs > 4 * (oldEnd + newEnd - 2 * begin) && (nesting || 0) < 8) {
            var counts = Object.create(null),
                anchorTails = [],
                anchorChains = [];
            for (j = begin; j < newEnd; j++) counts[b[j]] = (counts[b[j]] || 0) + 1;
            for (j = begin; j < newEnd; j++) {
                var matches = positions[b[j]];
                if (counts[b[j]] !== 1 || !matches || matches.length !== 1) continue;
                var anchorOld = matches[0],
                    anchorLow = 0,
                    anchorHigh = anchorTails.length;
                while (anchorLow < anchorHigh) {
                    var anchorMiddle = (anchorLow + anchorHigh) >>> 1;
                    if (anchorTails[anchorMiddle] < anchorOld) anchorLow = anchorMiddle + 1;
                    else anchorHigh = anchorMiddle;
                }
                if ((budget.remaining -= 33) < 0) {
                    exhausted = true;
                    break;
                }
                anchorTails[anchorLow] = anchorOld;
                anchorChains[anchorLow] = {
                    old: anchorOld,
                    next: j,
                    previous: anchorLow ? anchorChains[anchorLow - 1] : null,
                };
            }
            var anchor = anchorChains[anchorChains.length - 1];
            while (anchor) {
                anchors.push(anchor);
                anchor = anchor.previous;
            }
            anchors.reverse();
        }
        if (anchors.length && !exhausted) {
            var oldStart = begin,
                newStart = begin;
            anchors.push({ old: oldEnd, next: newEnd });
            for (var segment = 0; segment < anchors.length; segment++) {
                var anchor = anchors[segment],
                    gap = this.match(
                        a.slice(oldStart, anchor.old),
                        b.slice(newStart, anchor.next),
                        budget,
                        (nesting || 0) + 1
                    );
                if (gap.partial) exhausted = true;
                for (var g = 0; g < gap.length; g++) {
                    if (gap[g] === undefined) continue;
                    map[newStart + g] = oldStart + gap[g];
                    used[oldStart + gap[g]] = true;
                }
                if (anchor.old < oldEnd) {
                    map[anchor.next] = anchor.old;
                    used[anchor.old] = true;
                }
                oldStart = anchor.old + 1;
                newStart = anchor.next + 1;
            }
        } else if (pairs <= 4 * (oldEnd + newEnd - 2 * begin)) {
            var tails = [];
            for (j = begin; j < newEnd; j++) {
                var candidates = positions[b[j]] || [];
                for (var c = candidates.length - 1; c >= 0; c--) {
                    if (--budget.remaining < 0) {
                        exhausted = true;
                        break;
                    }
                    var oldIndex = candidates[c],
                        low = 0,
                        high = tails.length;
                    while (low < high) {
                        var middle = (low + high) >>> 1;
                        if (tails[middle] < oldIndex) low = middle + 1;
                        else high = middle;
                    }
                    if (tails[low] === oldIndex) continue;
                    // Account for retained traceback links as well as candidate comparisons.
                    if ((budget.remaining -= 32) < 0) {
                        exhausted = true;
                        break;
                    }
                    tails[low] = oldIndex;
                    chains[low] = { old: oldIndex, next: j, length: 1, previous: low ? chains[low - 1] : null };
                }
                if (exhausted) break;
            }
            chain = chains[chains.length - 1];
        } else {
            var frontier = [],
                offset = oldEnd + newEnd - 2 * begin + 1,
                complete = false,
                furthest = -1;
            frontier[offset + 1] = begin;
            for (var depth = 0; depth < offset && !complete && !exhausted; depth++) {
                for (var diagonal = -depth; diagonal <= depth; diagonal += 2) {
                    if (--budget.remaining < 0) {
                        exhausted = true;
                        break;
                    }
                    var slot = offset + diagonal,
                        down = diagonal === -depth || (diagonal !== depth && frontier[slot - 1] < frontier[slot + 1]),
                        parent = chains[slot + (down ? 1 : -1)] || null,
                        x = down ? frontier[slot + 1] : frontier[slot - 1] + 1,
                        y = x - diagonal,
                        startX = x,
                        startY = y;
                    while (x < oldEnd && y < newEnd && a[x] === b[y]) {
                        if (--budget.remaining < 0) {
                            exhausted = true;
                            break;
                        }
                        x++;
                        y++;
                    }
                    if (x > startX) {
                        // Bound traceback memory as well as comparison work.
                        if ((budget.remaining -= 32) < 0) {
                            exhausted = true;
                            break;
                        }
                        parent = { old: startX, next: startY, length: x - startX, previous: parent };
                    }
                    frontier[slot] = x;
                    chains[slot] = parent;
                    if (x + y > furthest) {
                        furthest = x + y;
                        chain = parent;
                    }
                    if (x >= oldEnd && y >= newEnd) {
                        chain = parent;
                        complete = true;
                        break;
                    }
                }
            }
        }
        while (chain) {
            for (var matched = 0; matched < chain.length; matched++) {
                map[chain.next + matched] = chain.old + matched;
                used[chain.old + matched] = true;
            }
            chain = chain.previous;
        }
        // Keep repeated closing delimiters with their moved code rather than a suffix anchor.
        var inverse = [];
        map.forEach(function (oldIndex, newIndex) {
            inverse[oldIndex] = newIndex;
        });
        for (j = 0; j + 1 < m; j++) {
            i = map[j];
            if (i === undefined || !/\w/.test(b[j]) || /\w/.test(b[j + 1]) || a[i + 1] !== b[j + 1]) continue;
            var displaced = inverse[i + 1],
                oldNext = map[j + 1];
            if (oldNext === i + 1) continue;
            if (displaced !== undefined) {
                delete map[displaced];
            }
            if (oldNext !== undefined) {
                used[oldNext] = false;
                delete inverse[oldNext];
            }
            map[j + 1] = i + 1;
            used[i + 1] = true;
            inverse[i + 1] = j + 1;
        }
        // Moved blocks use indexed candidates; a source line can never credit a second copy.
        while (!exhausted) {
            var best = null;
            for (j = 0; j < m; j++) {
                if (map[j] !== undefined) continue;
                var candidates = positions[b[j]] || [];
                for (var c = 0; c < candidates.length; c++) {
                    if (--budget.remaining < 0) {
                        exhausted = true;
                        break;
                    }
                    i = candidates[c];
                    if (used[i]) continue;
                    var length = 0,
                        score = 0;
                    while (
                        i + length < n &&
                        j + length < m &&
                        !used[i + length] &&
                        map[j + length] === undefined &&
                        a[i + length] === b[j + length]
                    ) {
                        if (--budget.remaining < 0) {
                            exhausted = true;
                            break;
                        }
                        score += a[i + length].length;
                        length++;
                    }
                    if (exhausted) break;
                    if (length >= 2 && score >= 20 && (!best || score > best.score))
                        best = { i: i, j: j, length: length, score: score };
                }
                if (exhausted) break;
            }
            if (!best || exhausted) break;
            for (var k = 0; k < best.length; k++) {
                map[best.j + k] = best.i + k;
                used[best.i + k] = true;
            }
        }
        var oldOccurrences = Object.create(null),
            newOccurrences = Object.create(null);
        for (i = 0; i < n; i++)
            if (!used[i] && /\w/.test(a[i])) (oldOccurrences[a[i]] || (oldOccurrences[a[i]] = [])).push(i);
        for (j = 0; j < m; j++)
            if (map[j] === undefined && /\w/.test(b[j])) (newOccurrences[b[j]] || (newOccurrences[b[j]] = [])).push(j);
        Object.keys(newOccurrences).forEach(function (line) {
            if (oldOccurrences[line] && oldOccurrences[line].length === 1 && newOccurrences[line].length === 1)
                map[newOccurrences[line][0]] = oldOccurrences[line][0];
        });
        if (exhausted) map.partial = true;
        return map;
    },
};

CreditAnalysis.prototype.process = function (kind, batch) {
    var self = this;
    function lines(code) {
        return code === '' ? [] : code.split('\n');
    }
    if (kind === 'credit') {
        var field = batch.field;
        if (batch.partial && !this.warnings.length) this.warnings.push('History is limited. Attribution is partial.');
        batch.snapshots.forEach(function (snapshot) {
            var code = snapshot.values[field];
            self.updates.push({
                id: snapshot.id,
                author: snapshot.author,
                time: snapshot.time,
                updateSet: snapshot.updateSet,
                available: code !== null,
            });
            if (code === null) {
                self.previous[field] = [];
                self.origins = [];
                self.warnings.push(
                    'An unavailable or field-missing snapshot interrupts attribution at customer update ' +
                        snapshot.id +
                        '.'
                );
                return;
            }
            var current = lines(code),
                previous = self.previous[field] || [],
                mapping = self.match(previous, current, { remaining: self.limits.diff_work });
            if (
                mapping.partial &&
                self.warnings.indexOf('Comparison limit reached. Some line attribution is unavailable.') === -1
            )
                self.warnings.push('Comparison limit reached. Some line attribution is unavailable.');
            self.origins = current.map(function (line, i) {
                return mapping[i] === undefined ? (mapping.partial ? null : snapshot.id) : self.origins[mapping[i]];
            });
            self.previous[field] = current;
        });
        if (batch.nextCursor) return { success: true, nextCursor: batch.nextCursor, historyKey: batch.historyKey };
        var result = Object.assign({}, batch, {
            updates: this.updates,
            warnings: this.warnings,
            lines: (this.previous[field] || []).map(function (line, i) {
                return { number: i + 1, text: line, update: self.origins[i] };
            }),
        });
        delete result.snapshots;
        delete result.limits;
        return result;
    }
    if (kind !== 'statistics') throw new Error('Unknown Credit+ computation.');
    var authors = Object.create(null);
    batch.creators.forEach(function (author) {
        authors[author.name] = author;
    });
    batch.creatorSets = [];
    batch.snapshots.forEach(function (snapshot) {
        var author = authors[snapshot.author],
            set = {
                key: snapshot.updateSet ? snapshot.updateSet.table + ':' + snapshot.updateSet.id : snapshot.id,
                name: snapshot.updateSet ? snapshot.updateSet.name : 'Unknown update set',
                updateSet: snapshot.updateSet,
                added: 0,
                removed: 0,
            };
        batch.creatorSets.push(set);
        batch.fields.forEach(function (field, index) {
            var code = snapshot.values[field.name],
                prior = self.previous[field.name];
            if (code === null) {
                self.previous[field.name] = null;
                batch.partial = true;
                batch.gaps++;
                return;
            }
            var current = lines(code);
            if (prior !== null) {
                prior = prior || [];
                var mapping = self.match(prior, current, { remaining: self.limits.diff_work }),
                    matched = 0;
                if (mapping.partial) {
                    batch.partial = true;
                    batch.gaps++;
                } else {
                    for (var i = 0; i < current.length; i++) if (mapping[i] !== undefined) matched++;
                    var added = current.length - matched,
                        removed = prior.length - matched;
                    author.added += added;
                    author.removed += removed;
                    set.added += added;
                    set.removed += removed;
                    batch.fieldTotals[index].added += added;
                    batch.fieldTotals[index].removed += removed;
                    batch.added += added;
                    batch.removed += removed;
                }
            }
            self.previous[field.name] = current;
        });
    });
    delete batch.snapshots;
    delete batch.limits;
    return batch;
};

// Run matching only in the same-origin browser worker.
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    var creditAnalysis;
    self.onmessage = function (event) {
        try {
            var input = event.data;
            if (!creditAnalysis) creditAnalysis = new CreditAnalysis(input.batch.limits, input.batch.whitespace);
            self.postMessage(creditAnalysis.process(input.kind, input.batch));
        } catch (error) {
            self.postMessage({ success: false, error: error.message || 'Credit+ calculation failed.' });
        }
    };
}
