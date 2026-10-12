(function () {
    'use strict';

    // Compare exported field values, not display labels or generated metadata.
    function annotateFieldChanges(previous, current, currentDeleted) {
        function fields(record) {
            var result = Object.create(null);
            if (record)
                Array.prototype.forEach.call(record.children, function (field) {
                    result[field.tagName] = field;
                });
            return result;
        }
        var before = fields(previous);
        var after = fields(current);
        var names = Object.keys(before);
        Object.keys(after).forEach(function (name) {
            if (!before[name]) names.push(name);
        });
        function isNil(field) {
            return field.getAttribute('nil') === 'true' || field.getAttribute('nil') === '1';
        }
        names.forEach(function (name) {
            var left = before[name];
            var right = after[name];
            var status = null;
            if (
                (left && (left.getAttribute('redacted') === 'true' || left.children.length)) ||
                (right && (right.getAttribute('redacted') === 'true' || right.children.length))
            ) {
                // Not comparable — already conveyed by redacted="true" or the field's own
                // nested structure; leaving change unset avoids a second, redundant signal.
            } else if (currentDeleted && previous) {
                status = 'removed';
            } else if (!previous || !current) {
                // The whole record is missing on one side — already conveyed by the
                // enclosing previous_version's status="new" or the deleted_record fallback.
            } else if (!left) {
                status = 'added';
            } else if (!right) {
                status = 'removed';
            } else {
                status =
                    left.textContent === right.textContent && isNil(left) === isNil(right) ? 'unchanged' : 'modified';
            }
            if (!status) return;
            if (left) left.setAttribute('change', status);
            if (right) right.setAttribute('change', status);
        });
    }
    // End field comparison helper.

    window.WE_XML_EXPORT = { annotateFieldChanges: annotateFieldChanges };
})();
