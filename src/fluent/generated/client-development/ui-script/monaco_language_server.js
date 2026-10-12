/**
 * ============================================================================
 * UI Script: monaco_language_server
 * ============================================================================
 * Purpose: Ambient TypeScript declarations supplementing ServiceNow's own
 * server-side completions endpoint, for server script / Script Include
 * editors using the 'javascript'/'typescript' Monaco languages.
 *
 * Contains:
 *   - GlideRecordGenerated method augmentations, shared by GlideRecord and
 *     GlideRecordSecure through TypeScript's declaration hierarchy
 *   - GlideRecordSecure interface (merges with the runtime-patched class
 *     declaration applied by loadSnTypeDefinitions() in client_script.js)
 *   - $sp Service Portal server API interface
 *   - window.MONACO_LANGUAGE_SERVER_DTS — the declaration string, injected
 *     via loadServerMonarchDts() in monaco_plus_core
 * ============================================================================
 */
(function () {
    'use strict';

    window.MONACO_LANGUAGE_SERVER_DTS = `
// -----------------------------------------------------------------------------
// ServiceNow Server-Side API Supplement
// -----------------------------------------------------------------------------

// Augments GlideRecordGenerated, the SN completions DTS's GlideRecord hierarchy root, so methods reach both GlideRecord and GlideRecordSecure.
// @see https://www.servicenow.com/docs/r/yokohama/api-reference/server-api-reference/c_GlideRecordAPI.html

interface GlideRecordGenerated {

    // ---- Record lifecycle ---------------------------------------------------

    /**
     * Creates a new record ready for population and insert().
     * Sets all fields to default values. Equivalent to a blank form load.
     * @returns \`true\` if the record was created successfully.
     */
    newRecord(): boolean;

    /**
     * Initialises the GlideRecord to the default values for a new record
     * without marking it as "new". Subsequent insert() creates a new row.
     */
    initialize(): void;

    /**
     * Returns \`true\` if the current record has never been saved (i.e. it was
     * created via newRecord() or initialize() and insert() has not been called).
     */
    isNewRecord(): boolean;

    // ---- Save behaviour ----------------------------------------------------

    /**
     * Enables or disables automatic population of system fields
     * (sys_created_by, sys_created_on, sys_updated_by, sys_updated_on).
     * Pass \`false\` to preserve original values when copying records.
     * @param enable \`false\` disables auto-population; \`true\` re-enables it.
     */
    autoSysFields(enable: boolean): void;

    /**
     * Controls whether workflow / business process engines run when this
     * record is inserted or updated.
     * @param enable \`false\` suppresses workflow; \`true\` re-enables it.
     */
    setWorkflow(enable: boolean): void;

    /**
     * Forces an update() to write to the database even if no fields have
     * changed since the record was loaded.
     * @param enable \`true\` forces the update.
     */
    setForceUpdate(enable: boolean): void;

    /**
     * Signals a business rule to abort the current action (insert/update/delete).
     * Typically called from a before business rule.
     * @param b \`true\` aborts the action.
     */
    setAbortAction(b: boolean): void;

    /**
     * Returns \`true\` if a prior \`setAbortAction(true)\` call has aborted the
     * current business rule action.
     */
    isActionAborted(): boolean;

    /**
     * Applies the named record template to the current GlideRecord instance.
     * @param template Name of the saved template to apply.
     */
    applyTemplate(template: string): void;

    // ---- Query helpers ------------------------------------------------------

    /**
     * Adds a query for active = true. Equivalent to \`addQuery('active', true)\`.
     * @returns The GlideQueryCondition for further chaining.
     */
    addActiveQuery(): GlideQueryCondition;

    /**
     * Adds a condition that the field must not be NULL.
     * @param fieldName The field to check.
     * @returns The GlideQueryCondition for further chaining.
     */
    addNotNullQuery(fieldName: string): GlideQueryCondition;

    /**
     * Adds a condition that the field must be NULL.
     * @param fieldName The field to check.
     * @returns The GlideQueryCondition for further chaining.
     */
    addNullQuery(fieldName: string): GlideQueryCondition;

    /**
     * Adds a join condition to the query (INNER JOIN by default).
     * @param joinTable The table to join.
     * @param primaryField Field on this table to join on (default: sys_id).
     * @param joinTableField Field on the joined table (default: sys_id).
     * @returns A GlideRecord for the joined table to add further conditions.
     */
    addJoinQuery(joinTable: string, primaryField?: string, joinTableField?: string): GlideRecordGenerated;

    /**
     * Adds an aggregate function (COUNT, SUM, MIN, MAX, AVG) to the query.
     * Results are retrieved with \`getAggregate()\`.
     * @param aggregate Aggregate function name (e.g. \`"COUNT"\`, \`"SUM"\`).
     * @param field Optional field to aggregate on.
     */
    addAggregate(aggregate: string, field?: string): void;

    /**
     * Retrieves the value of an aggregate set by \`addAggregate()\`.
     * @param aggregate Aggregate function name.
     * @param field Optional field the aggregate was applied to.
     * @returns The aggregate value as a string.
     */
    getAggregate(aggregate: string, field?: string): string;

    /**
     * Groups results by the specified field when using \`addAggregate()\`.
     * @param fieldName The field to group by.
     */
    groupBy(fieldName: string): void;

    /**
     * Adds a HAVING clause when using aggregates.
     * @param aggregate Aggregate function name.
     * @param field Field the aggregate is applied to.
     * @param operator Comparison operator (e.g. \`">"\`, \`"="\`).
     * @param value Value to compare against.
     */
    addHaving(aggregate: string, field: string, operator: string, value: string): void;

    /**
     * Returns the number of records returned by the most recent query.
     * Only reliable if setLimit() was not used or if the full result set fits.
     */
    getRowCount(): number;

    /**
     * Returns \`true\` if there are additional records that have not yet been
     * iterated via \`next()\`.
     */
    hasNext(): boolean;

    /**
     * Restricts the query to a row window (pagination).
     * @param firstRow Zero-based index of the first row to return.
     * @param lastRow Zero-based index of the last row to return (exclusive).
     * @param forceCount If \`true\`, always compute the total row count.
     */
    chooseWindow(firstRow: number, lastRow: number, forceCount?: boolean): void;

    // ---- Record metadata ---------------------------------------------------

    /**
     * Returns the fully-qualified class name of the current record
     * (e.g. \`"incident"\` even when querying the base \`task\` table).
     */
    getRecordClassName(): string;

    /**
     * Returns the display name of the table the GlideRecord represents.
     */
    getTableDisplayName(): string;

    /**
     * Returns the display value of a field, or the record's display value
     * when called with no arguments.
     * @param fieldName Optional field name; omit to get the record display value.
     */
    getDisplayValue(fieldName?: string): string;

    /**
     * Returns \`true\` if the named field exists on this table.
     * @param fieldName The field name to validate.
     */
    isValidField(fieldName: string): boolean;

    /**
     * Returns \`true\` if the current row represents a valid record
     * (i.e. a row was found and next() returned \`true\`).
     */
    isValidRecord(): boolean;

    /**
     * Returns the unique sys_id of the current record.
     * Equivalent to \`getValue('sys_id')\`.
     */
    getUniqueValue(): string;

    /**
     * Returns a relative URL pointing to the current record's form view.
     * @param noStack If \`true\`, suppresses breadcrumb stack navigation.
     */
    getLink(noStack?: boolean): string;

    /**
     * Returns the last error message produced by a failed DML operation.
     */
    getLastErrorMessage(): string;

    /**
     * Returns the value of the named field attribute (metadata).
     * @param fieldName The field name.
     */
    getAttribute(fieldName: string): string;

    /**
     * Returns the class (table name) of the record as a display value,
     * resolving extended table hierarchies.
     */
    getClassDisplayValue(): string;

    /**
     * Returns the category of the record (used by UI policies / notifications).
     */
    getCategory(): string;

    /**
     * Sets the record category.
     * @param category Category value string.
     */
    setCategory(category: string): void;

    /**
     * Returns \`true\` if the current record is owned by the logged-in user.
     */
    isMine(): boolean;

    /**
     * Returns \`true\` if the record is a member of (or extends) the given class.
     * @param className The table/class name to test.
     */
    instanceOf(className: string): boolean;

    // ---- Cursor management -------------------------------------------------

    /**
     * Saves the current query cursor position so it can be restored later.
     */
    saveLocation(): void;

    /**
     * Restores a cursor position previously saved by \`saveLocation()\`.
     */
    restoreLocation(): void;

    // ---- Aliases -----------------------------------------------------------

    /**
     * Alias for \`addOrderBy()\`. Adds an ascending sort on the given field.
     * @param fieldName The field to sort by.
     */
    orderBy(fieldName: string): void;

    /**
     * Alias for \`addOrderByDesc()\`. Adds a descending sort on the given field.
     * @param fieldName The field to sort by.
     */
    orderByDesc(fieldName: string): void;

    /**
     * Sets the display value of a field. The value is looked up from the
     * reference / choice list rather than set as a raw value.
     * @param fieldName The field name.
     * @param value The display value to set.
     */
    setDisplayValue(fieldName: string, value: string): void;

    /**
     * Adds an extra field from a related or dot-walked table to the query result
     * set. The field is then accessible via \`getValue()\` using the dot-walk path.
     * Useful when you need a referenced field without a separate GlideRecord query.
     * @param fieldName Dot-walked field path to include (e.g. \`"assigned_to.email"\`).
     */
    addExtraField(fieldName: string): void;

    // ---- Constructor -------------------------------------------------------

    /**
     * Creates a new GlideRecord instance for the specified table.
     * @param tableName The database table name (e.g. \`"incident"\`, \`"sys_user"\`).
     * @example
     * var gr = new GlideRecord('incident');
     * gr.addQuery('active', true);
     * gr.query();
     * while (gr.next()) { gs.info(gr.getValue('number')); }
     */
    constructor(tableName: string);

    // ---- ACL checks --------------------------------------------------------

    /**
     * Returns \`true\` if the current user can create records in this table.
     * Evaluates all applicable Create ACLs.
     */
    canCreate(): boolean;

    /**
     * Returns \`true\` if the current user can delete the current record.
     * Evaluates all applicable Delete ACLs.
     */
    canDelete(): boolean;

    /**
     * Returns \`true\` if the current user can read the current record.
     * Evaluates all applicable Read ACLs.
     */
    canRead(): boolean;

    /**
     * Returns \`true\` if the current user can write to the current record.
     * Evaluates all applicable Write ACLs.
     */
    canWrite(): boolean;

    // ---- Change detection --------------------------------------------------

    /**
     * Returns \`true\` if any field value has changed since the record was last saved.
     */
    changes(): boolean;

    // ---- Additional query building -----------------------------------------

    /**
     * Changes the domain context for this query.
     * @param glideRecord A GlideRecord positioned on a \`sys_domain\` row, or a domain \`sys_id\`.
     */
    addDomainQuery(glideRecord: object): void;

    /**
     * Appends an encoded query string to the current query conditions.
     * Multiple calls are AND'd together.
     * @param query Encoded query string (e.g. \`"active=true^priority=1"\`).
     * @param enforceFieldACL When \`true\`, field-level Read ACLs filter inaccessible conditions.
     */
    addEncodedQuery(query: string, enforceFieldACL?: boolean): void;

    /**
     * Applies a \`GlideDBFunctionBuilder\` aggregate function to this query.
     * @param functionBuilder A configured GlideDBFunctionBuilder instance.
     */
    addFunction(functionBuilder: object): void;

    /**
     * Adds a query condition for inactive records (\`active = false\`).
     * @returns The GlideQueryCondition for further chaining.
     */
    addInactiveQuery(): GlideQueryCondition;

    /**
     * Like \`addQuery()\` but enforces Read ACLs — conditions on fields the
     * current user cannot read are excluded from evaluation.
     * @param name Field name.
     * @param operator Comparison operator, or (when \`value\` is omitted) the equality value.
     * @param value Value to compare against.
     * @returns The GlideQueryCondition for further chaining.
     */
    addUserQuery(name: string, operator: object, value?: object): GlideQueryCondition;

    /**
     * Atomically adds (or subtracts, using a negative number) to a numeric field
     * without fetching the record first. Does not trigger business rules.
     * @param field Numeric field name.
     * @param value The amount to add (use negative to subtract).
     */
    addValue(field: string, value: number): void;

    /**
     * Replaces the current query conditions with the supplied encoded query string.
     * Unlike \`addEncodedQuery()\`, this is non-additive.
     * @param queryString The encoded query string to apply.
     */
    applyEncodedQuery(queryString: string): void;

    // ---- CRUD operations ---------------------------------------------------

    /**
     * Deletes all records that match the current query conditions.
     * Use with caution — this is a bulk, non-reversible operation.
     */
    deleteMultiple(): void;

    /**
     * Deletes the current record.
     * @returns \`true\` if the record was deleted successfully.
     */
    deleteRecord(): boolean;

    /**
     * Searches the result set for a row where \`columnName\` equals \`value\`
     * and repositions the cursor there.
     * @param columnName Field name to search.
     * @param value Value to match.
     * @returns \`true\` if a matching row was found.
     */
    find(columnName: string, value: string): boolean;

    /**
     * Fetches a single record by \`sys_id\` or by a field/value pair and positions
     * the cursor on that row.
     * @param name A \`sys_id\` string, or a field name when paired with \`value\`.
     * @param value Value to match when \`name\` is a field name.
     * @returns \`true\` if a record was found.
     */
    get(name: object, value?: object): boolean;

    /**
     * Inserts the current record into the database.
     * @returns The \`sys_id\` of the inserted record, or \`null\` on failure.
     */
    insert(): string;

    /**
     * Inserts the current record, first resolving reference fields by display value.
     * @returns The \`sys_id\` of the inserted record, or \`null\` on failure.
     */
    insertWithReferences(): string;

    /**
     * Advances the cursor to the next row in the result set.
     * @returns \`true\` if another record is available.
     */
    next(): boolean;

    /**
     * Internal variant of \`next()\` that advances without firing business rules.
     * @returns \`true\` if another record is available.
     */
    _next(): boolean;

    /**
     * Returns the DML operation currently being performed on this record.
     * @returns \`"insert"\`, \`"update"\`, \`"delete"\`, or \`"get"\`.
     */
    operation(): string;

    /**
     * Executes the query. Optionally adds a single equality condition first.
     * @param field Optional field name to add an equality condition.
     * @param value Optional value for the equality condition.
     */
    query(field?: string, value?: string): void;

    /**
     * Internal variant of \`query()\` that executes without firing business rules.
     * @param field Optional field name.
     * @param value Optional value.
     */
    _query(field?: string, value?: string): void;

    /**
     * Executes the query while ignoring domain-separation restrictions.
     * Returns results from all domains regardless of the current user's domain.
     * @param field Optional field name.
     * @param value Optional value.
     */
    queryNoDomain(field?: string, value?: string): void;

    /**
     * Saves changes to the current record in the database.
     * @param reason Optional text reason stored in the audit log.
     * @returns The \`sys_id\` of the updated record, or \`null\` on failure.
     */
    update(reason?: object): string;

    /**
     * Updates all records matching the current query conditions.
     * Does not trigger business rules by default.
     */
    updateMultiple(): void;

    /**
     * Updates the current record after resolving reference fields by display value.
     * @param reason Optional text reason stored in the audit log.
     * @returns The \`sys_id\` of the updated record, or \`null\` on failure.
     */
    updateWithReferences(reason?: object): string;

    // ---- Getters -----------------------------------------------------------

    /**
     * Returns the GlideElementDescriptor for this table's primary key field,
     * providing schema metadata such as type, length, and dictionary attributes.
     */
    getED(): GlideElementDescriptor;

    /**
     * Returns the {@link GlideElement} object for the specified field,
     * giving access to typed field operations and metadata.
     * @param fieldName The field name.
     */
    getElement(fieldName: string): GlideElement;

    /**
     * Returns the current query conditions as an encoded query string.
     */
    getEncodedQuery(): string;

    /**
     * Returns the HTML-escaped display value of the current record.
     */
    getEscapedDisplayValue(): string;

    /**
     * Returns an array of all field names present on the current record.
     */
    getFields(): string[];

    /**
     * Returns the translated label for this table's primary display field.
     */
    getLabel(): string;

    /**
     * Returns the zero-based row index of the current cursor position.
     */
    getLocation(): number;

    /**
     * Returns the plural label of the table (e.g. \`"Incidents"\`).
     */
    getPlural(): string;

    /**
     * Returns metadata about the related lists configured for this table.
     */
    getRelatedLists(): object;

    /**
     * Returns metadata about tables that have a relationship with this table.
     */
    getRelatedTables(): object;

    /**
     * Returns the zero-based index of the current row in the result set.
     * Equivalent to \`getLocation()\`.
     */
    getRowNumber(): number;

    /**
     * Returns the internal database table name for this GlideRecord (e.g. \`"incident"\`).
     */
    getTableName(): string;

    /**
     * Returns the raw (database-stored) value of the specified field.
     * For Reference fields this is the \`sys_id\` of the referenced record.
     * @param fieldName The field name.
     */
    getValue(fieldName: string): string;

    /**
     * Returns \`true\` if the current record has file attachments.
     */
    hasAttachments(): boolean;

    /**
     * Returns \`true\` if the table this GlideRecord represents exists in the database.
     */
    isValid(): boolean;

    // ---- Setters -----------------------------------------------------------

    /**
     * Prevents the query optimiser from separating the \`sys_id\` condition from
     * an \`addEncodedQuery()\` filter. Use on large tables when the optimiser
     * produces incorrect result splits.
     */
    disableSysIdInOptimization(): void;

    /**
     * Limits the maximum number of rows returned by the next \`query()\` call.
     * @param limit Row count limit.
     */
    setLimit(limit: number): void;

    /**
     * Repositions the cursor to the specified zero-based row index.
     * @param rowNumber Zero-based row index.
     */
    setLocation(rowNumber: number): void;

    /**
     * Generates and assigns a new GUID to this record's \`sys_id\`.
     * Call before \`insert()\` to control the sys_id of the new record.
     * @returns The generated GUID string.
     */
    setNewGuid(): string;

    /**
     * Assigns an explicit GUID value as the \`sys_id\` for this new record.
     * @param guid GUID string to assign.
     */
    setNewGuidValue(guid: string): void;

    /**
     * Suppresses the automatic \`COUNT(*)\` pre-query so that \`getRowCount()\`
     * returns \`-1\`. Improves performance when the row count is not needed.
     */
    setNoCount(): void;

    /**
     * When \`true\`, reference field values in encoded query output use the
     * referenced record's display value instead of its \`sys_id\`.
     * @param queryReferences \`true\` to use display names.
     */
    setQueryReferences(queryReferences: boolean): void;

    /**
     * Enables or disables ServiceNow business-process engines (e.g. SLA engine).
     * @param e \`false\` disables engines; \`true\` re-enables them.
     */
    setUseEngines(e: boolean): void;

    /**
     * Sets the raw (database) value of the specified field.
     * For Reference fields, pass the \`sys_id\` of the referenced record.
     * @param name Field name.
     * @param value Value to assign.
     */
    setValue(name: string, value: object): void;

    // ---- Dynamic attributes ------------------------------------------------

    /**
     * Returns the dynamic attribute element at the given dot-notation path.
     * @param fullPath Full dot-notation path (e.g. \`"cmdb_ci_attributes.location"\`).
     */
    getDynamicAttribute(fullPath: string): GlideElementDynamicAttribute;

    /**
     * Returns the dynamic attribute element for the given field and attribute path.
     * @param dynamicAttributeField The field that hosts the dynamic attribute container.
     * @param attrPath The attribute path within that container.
     */
    getDynamicAttribute(dynamicAttributeField: string, attrPath: string): GlideElementDynamicAttribute;

    /**
     * Returns the raw value of a dynamic attribute at the given full path.
     * @param fullPath Full dot-notation path.
     */
    getDynamicAttributeValue(fullPath: string): any;

    /**
     * Returns the raw value of a dynamic attribute by field and path.
     * @param dynamicAttributeField The field hosting the dynamic attribute.
     * @param attrPath Attribute path within the field.
     */
    getDynamicAttributeValue(dynamicAttributeField: string, attrPath: string): any;

    /**
     * Returns the display value of a dynamic attribute at the given full path.
     * @param fullPath Full dot-notation path.
     */
    getDynamicAttributeDisplayValue(fullPath: string): string;

    /**
     * Returns the display value of a dynamic attribute by field and path.
     * @param dynamicAttributeField The field hosting the dynamic attribute.
     * @param attrPath Attribute path within the field.
     */
    getDynamicAttributeDisplayValue(dynamicAttributeField: string, attrPath: string): string;

    /**
     * Sets a dynamic attribute's raw value at the given full path.
     * @param fullPath Full dot-notation path.
     * @param value The value to assign.
     */
    setDynamicAttributeValue(fullPath: string, value: object): void;

    /**
     * Sets a dynamic attribute's raw value by field and path.
     * @param dynamicAttributeField The field hosting the dynamic attribute.
     * @param attrPath Attribute path within the field.
     * @param value The value to assign.
     */
    setDynamicAttributeValue(dynamicAttributeField: string, attrPath: string, value: object): void;

    /**
     * Sets a dynamic attribute's display value at the given full path.
     * @param fullPath Full dot-notation path.
     * @param value The display value to assign.
     */
    setDynamicAttributeDisplayValue(fullPath: string, value: object): void;

    /**
     * Sets a dynamic attribute's display value by field and path.
     * @param dynamicAttributeField The field hosting the dynamic attribute.
     * @param attrPath Attribute path within the field.
     * @param value The display value to assign.
     */
    setDynamicAttributeDisplayValue(dynamicAttributeField: string, attrPath: string, value: object): void;

    /**
     * Bulk-sets dynamic attribute values from a \`GlideDynamicAttributeStore\`.
     * @param dynamicAttributeField The field that owns the dynamic attribute container.
     * @param values A GlideDynamicAttributeStore containing the values to apply.
     */
    setDynamicAttributeValues(dynamicAttributeField: string, values: GlideDynamicAttributeStore): void;
}

// Patched at runtime by loadSnTypeDefinitions() in client_script.js to extend GlideRecordGenerated instead of the non-constructable GlideRecord.
/**
 * ACL-enforcing variant of {@link GlideRecord}.
 * Performs the same operations as GlideRecord but enforces all read, write,
 * create, and delete ACLs on every field access and record operation.
 * @see https://developer.servicenow.com/dev.do#!/reference/api/sandiego/server/no-namespace/c_GlideRecordSecureScopedAPI
 */
interface GlideRecordSecure extends GlideRecordGenerated {
    /**
     * Enables an ACL security feature by name for this instance.
     * @param feature The security feature identifier.
     */
    enableSecurityFeature(feature: string): void;
    /**
     * Disables an ACL security feature by name for this instance.
     * @param feature The security feature identifier.
     */
    disableSecurityFeature(feature: string): void;
}

// ---- GlideElement -----------------------------------------------------------

/**
 * Represents a single field on a {@link GlideRecord} row, providing typed access,
 * metadata, and per-field operations.
 *
 * Obtain a GlideElement via {@link GlideRecord.getElement} or by accessing the
 * field directly as a GlideRecord property (e.g. \`gr.short_description\`).
 *
 * @see https://www.servicenow.com/docs/r/zurich/api-reference/server-api-reference/c_GlideElementAPI.html
 * @example
 * var gr = new GlideRecord('incident');
 * gr.get('abc123');
 * var el = gr.getElement('short_description');
 * gs.info(el.getDisplayValue());
 * gs.info(el.changes()); // false — nothing changed since load
 */
interface GlideElement {

    // ---- ACL checks --------------------------------------------------------

    /**
     * Returns \`true\` if the current user has Create access on this field.
     */
    canCreate(): boolean;

    /**
     * Returns \`true\` if the current user has Read access on this field.
     */
    canRead(): boolean;

    /**
     * Returns \`true\` if the current user has Write access on this field.
     */
    canWrite(): boolean;

    // ---- Change detection --------------------------------------------------

    /**
     * Returns \`true\` if this field's value has changed since the record was loaded.
     */
    changes(): boolean;

    /**
     * Returns \`true\` if the field's previous (before-update) value equals \`o\`.
     * @param o Value to compare against the previous value.
     */
    changesFrom(o: object): boolean;

    /**
     * Returns \`true\` if the field's current (after-update) value equals \`o\`.
     * @param o Value to compare against the new value.
     */
    changesTo(o: object): boolean;

    // ---- Date/time ---------------------------------------------------------

    /**
     * Returns this date/date-time field's value as milliseconds since the
     * Unix epoch (1970-01-01T00:00:00Z).
     */
    dateNumericValue(): number;

    /**
     * Sets this date/date-time field from a millisecond epoch timestamp.
     * @param milliseconds Epoch time in milliseconds.
     */
    setDateNumericValue(milliseconds: number): void;

    // ---- Attributes --------------------------------------------------------

    /**
     * Returns the value of a named attribute defined for this field in the dictionary.
     * @param attributeName The attribute name.
     */
    getAttribute(attributeName: string): string;

    /**
     * Returns the value of a named dictionary attribute as a \`boolean\`.
     * @param attributeName The attribute name.
     */
    getBooleanAttribute(attributeName: string): boolean;

    // ---- Choices -----------------------------------------------------------

    /**
     * Returns the choice list entries as an array of display value strings.
     * For dependent choice fields, pass the current value of the controlling field.
     * @param dependent Optional: current value of the field this choice depends on.
     */
    getChoices(dependent?: string): string[];

    /**
     * Returns the translated label of the currently selected choice value.
     */
    getChoiceValue(): string;

    // ---- Encryption --------------------------------------------------------

    /**
     * Returns the decrypted plain-text value for Password2 (encrypted) fields.
     * Requires the \`snc_encryption_access\` role.
     */
    getDecryptedValue(): string;

    // ---- Display values ----------------------------------------------------

    /**
     * Returns the human-readable display value of this field.
     * For Reference fields, returns the referenced record's display value.
     * @param maxCharacters Optional: truncate the display value to this length.
     */
    getDisplayValue(maxCharacters?: number): string;

    /**
     * Returns the display value of this field in the specified locale/language.
     * @param language IETF language tag (e.g. \`"en"\`, \`"fr"\`, \`"de"\`).
     */
    getDisplayValueLang(language: string): string;

    /**
     * Returns the GlideElementDescriptor for this field, giving access to schema
     * metadata such as column type, maximum length, and dictionary attributes.
     */
    getED(): GlideElementDescriptor;

    /**
     * Returns the display value formatted for international use.
     * Primarily used for Phone fields to return the E.164-formatted number.
     */
    getGlobalDisplayValue(): string;

    /**
     * Returns the HTML-encoded representation of this field's value.
     * @param maxChars Optional maximum character count before truncation.
     */
    getHTMLValue(maxChars?: number): string;

    /**
     * Returns journal field entries (work notes / comments) as a newline-delimited string.
     * @param mostRecent Number of most-recent entries to return (1 = most recent only).
     */
    getJournalEntry(mostRecent?: number): string;

    // ---- Labels ------------------------------------------------------------

    /**
     * Returns the translated column label for this field.
     */
    getLabel(): string;

    /**
     * Returns the translated column label in the specified language.
     * @param language IETF language tag (e.g. \`"en"\`, \`"fr"\`).
     */
    getLabelLang(language: string): string;

    // ---- Names and table ---------------------------------------------------

    /**
     * Returns the internal column name of this field (e.g. \`"short_description"\`).
     */
    getName(): string;

    /**
     * Returns the name of the table this Reference field points to.
     * Returns an empty string for non-reference fields.
     */
    getReferenceTable(): string;

    /**
     * Returns a GlideRecord positioned on the record referenced by this field.
     * Executes an additional database query; use sparingly.
     */
    getRefRecord(): GlideRecord;

    /**
     * Returns the name of the table that owns this field.
     */
    getTableName(): string;

    // ---- Null check --------------------------------------------------------

    /**
     * Returns \`true\` if this field has no value (empty string, null, or undefined).
     */
    nil(): boolean;

    // ---- Setters -----------------------------------------------------------

    /**
     * Sets the display (human-readable) value of this field.
     * For Reference fields the framework resolves the display value to a \`sys_id\`.
     * @param value The display value to set.
     */
    setDisplayValue(value: object): void;

    /**
     * Attaches a validation error message to this field so that it appears on the form.
     * @param errorMessage Error text to display.
     */
    setError(errorMessage: string): void;

    /**
     * Sets a phone number field value. When \`strict\` is \`true\`, the number must
     * conform to E.164 format; invalid numbers are rejected.
     * @param phoneNumber Phone number string or object.
     * @param strict When \`true\`, enforces E.164 format validation.
     * @returns \`true\` if the value was accepted and set.
     */
    setPhoneNumber(phoneNumber: object, strict?: boolean): boolean;

    /**
     * Sets the raw (database) value of this field.
     * For Reference fields, pass the \`sys_id\` of the target record.
     * @param value The value to set.
     */
    setValue(value: object): void;

    // ---- String conversion -------------------------------------------------

    /**
     * Returns a string representation of this field's current value.
     */
    toString(): string;
}

// ---- $sp helper types -------------------------------------------------------

/** Rich field descriptor returned by \`$sp.getField()\` and \`$sp.getRecordElements()\`. */
interface SpFieldObject {
    /** Human-readable value shown to the user (e.g. referenced record's name). */
    display_value: string;
    /** Raw stored value (e.g. a \`sys_id\` for reference fields). */
    value: string;
    /** Translated column label. */
    label: string;
    /** Column data type (e.g. \`"string"\`, \`"reference"\`, \`"integer"\`, \`"boolean"\`). */
    type: string;
}

/** A single entry in an activity stream returned by \`$sp.getStream()\`. */
interface SpStreamEntry {
    /** ISO-8601 creation timestamp. */
    created_on: string;
    /** Display name of the user who created this entry. */
    created_by: string;
    /** Human-readable age string (e.g. \`"3 days ago"\`). */
    relative_created_on: string;
    /**
     * Entry type — common values: \`"work_notes"\`, \`"comments"\`, \`"field_changes"\`.
     */
    type: string;
    /** Entry body (may contain HTML). */
    value: string;
    /** \`sys_id\` of the creating user record. */
    sys_created_by: string;
    [key: string]: any;
}

/** Activity stream object returned by \`$sp.getStream()\`. */
interface SpStreamObject {
    /** Ordered array of activity entries. */
    entries: SpStreamEntry[];
    /** Display value of the currently assigned user (if applicable). */
    display_value: string;
    /** \`sys_id\` of the record whose stream was requested. */
    sys_id: string;
    /** Table name of the record. */
    table: string;
    /** \`true\` when the server truncated the entry list; more entries exist. */
    has_more_entries: boolean;
}

// ---- $sp — Service Portal Server Script API ----------------------------------

/**
 * Service Portal server-side scripting API.
 *
 * Available as the **implicit global \`$sp\`** in every widget server script.
 * This object is injected by the Service Portal framework; it is **not** available
 * in standard Script Includes, Business Rules, or other non-portal server scripts.
 *
 * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/server/service-portal-api
 */
declare var $sp: {

    // -------------------------------------------------------------------------
    // ACL / access checks
    // -------------------------------------------------------------------------

    /**
     * Returns \`true\` if the current user can read the supplied GlideRecord row.
     * Internally delegates to \`GlideRecord.canRead()\` so all ACL checks apply.
     * @param gr A GlideRecord already positioned on a specific row.
     */
    canReadRecord(gr: GlideRecord): boolean;

    /**
     * Returns \`true\` if the current user has read access to the specified record.
     * @param tableName The table name (e.g. \`"incident"\`).
     * @param sysId The \`sys_id\` of the record to check.
     */
    canReadRecord(tableName: string, sysId: string): boolean;

    // -------------------------------------------------------------------------
    // Catalog
    // -------------------------------------------------------------------------

    /**
     * Returns a fully-populated model and view-model for a Service Catalog item
     * (\`sc_cat_item\`) or catalog item guide (\`sc_cat_item_guide\`).
     *
     * The returned object mirrors the shape expected by the SP Catalog widget and
     * includes variables, pricing, and availability information.
     *
     * @param sysId The \`sys_id\` of the catalog item or item guide.
     * @returns Catalog item model object.
     */
    getCatalogItem(sysId: string): { [key: string]: any };

    // -------------------------------------------------------------------------
    // Portal / instance field helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the display value of a field on the current widget's \`sp_instance\`
     * record, falling back to the portal's \`sp_portal\` record if not found on
     * the instance.
     *
     * Useful for reading per-instance branding or configuration fields.
     *
     * @param fieldName The field name on \`sp_instance\` or \`sp_portal\`.
     * @returns The display value string.
     */
    getDisplayValue(fieldName: string): string;

    /**
     * Returns the raw value (not the display value) of a field on the current
     * \`sp_instance\` or \`sp_portal\` record.
     *
     * Compare with \`getDisplayValue()\` which returns the human-readable form.
     *
     * @param fieldName The field name.
     * @returns The raw value string.
     */
    getValue(fieldName: string): string;

    /**
     * Copies values from the current HTTP request parameters or widget instance
     * options into \`data\`. If \`fieldNames\` is omitted, all option fields are copied.
     *
     * @param data The target plain object to populate.
     * @param fieldNames Optional comma-separated field names to copy.
     */
    getValues(data: { [key: string]: any }, fieldNames?: string): void;

    /**
     * Returns the GlideRecord for the current portal (\`sp_portal\`).
     * Returns \`null\` when accessed outside a portal context.
     */
    getPortalRecord(): GlideRecord | null;

    /**
     * Returns the GlideRecord for the current widget instance (\`sp_instance\`).
     * Returns \`null\` when the widget is embedded inside another widget via
     * \`$sp.getWidget()\`.
     */
    getRecord(): GlideRecord | null;

    // -------------------------------------------------------------------------
    // GlideRecord field helpers
    // -------------------------------------------------------------------------

    /**
     * Returns a rich field descriptor for a single column on a GlideRecord row.
     * The descriptor contains \`display_value\`, \`label\`, \`type\`, and \`value\`.
     *
     * @param gr A GlideRecord positioned on a specific row.
     * @param fieldName The field name to describe.
     * @returns A {@link SpFieldObject}, or \`null\` if the field does not exist.
     */
    getField(gr: GlideRecord, fieldName: string): SpFieldObject | null;

    /**
     * Validates a comma-separated list of field names against a GlideRecord
     * and returns an array containing only the names that exist on the table.
     *
     * @param gr A GlideRecord for the target table.
     * @param fieldNames Comma-separated field names to validate.
     * @returns Array of valid field name strings.
     */
    getFields(gr: GlideRecord, fieldNames: string): string[];

    /**
     * Validates field names and returns an object whose keys are the valid names.
     * Use this for fast set-membership checks on field names.
     *
     * @param gr A GlideRecord for the target table.
     * @param fieldNames Comma-separated field names to validate.
     * @returns \`{ fieldName: true }\` for each valid field.
     */
    getFieldsObject(gr: GlideRecord, fieldNames: string): { [fieldName: string]: boolean };

    /**
     * Copies the **display value** of each listed field from \`gr\` into \`data\`.
     * The key in \`data\` is the field name; the value is the display value string.
     *
     * @param data Target plain object to populate.
     * @param gr GlideRecord positioned on the source row.
     * @param fieldNames Comma-separated field names.
     */
    getRecordDisplayValues(data: { [key: string]: any }, gr: GlideRecord, fieldNames: string): void;

    /**
     * Copies full {@link SpFieldObject} descriptors from \`gr\` into \`data\`.
     * Each key in \`data\` is a field name; the value is a SpFieldObject containing
     * \`value\`, \`display_value\`, \`label\`, and \`type\`.
     *
     * @param data Target plain object to populate.
     * @param gr GlideRecord positioned on the source row.
     * @param fieldNames Comma-separated field names.
     */
    getRecordElements(data: { [key: string]: any }, gr: GlideRecord, fieldNames: string): void;

    /**
     * Copies the **raw value** of each listed field from \`gr\` into \`data\`.
     *
     * @param data Target plain object to populate.
     * @param gr GlideRecord positioned on the source row.
     * @param fieldNames Comma-separated field names.
     */
    getRecordValues(data: { [key: string]: any }, gr: GlideRecord, fieldNames: string): void;

    // -------------------------------------------------------------------------
    // Form, list, menu
    // -------------------------------------------------------------------------

    /**
     * Returns the fully rendered form model for a record, ready for use with
     * the \`<sp-form>\` directive or a custom form widget.
     *
     * @param tableName The table name (e.g. \`"incident"\`).
     * @param sysId \`sys_id\` of the record, or \`""\` for a new record.
     * @param encodedQuery Optional encoded query applied to new records.
     * @param view Optional view name (defaults to \`"Default View"\`).
     * @returns Form model object with field descriptors, sections, and UI policy state.
     */
    getForm(tableName: string, sysId: string, encodedQuery?: string, view?: string): { [key: string]: any };

    /**
     * Returns the column descriptors for the specified table view.
     * Useful for building dynamic list widgets.
     *
     * @param tableName The table name.
     * @param view The view name (e.g. \`"mobile"\`, \`"Default view"\`).
     * @returns Array of column descriptor objects.
     */
    getListColumns(tableName: string, view: string): { [key: string]: any }[];

    /**
     * Derives the portal URL fragment (\`?id=page_id\`) for a nav menu entry based
     * on the menu item type and its linked record.
     *
     * @param gr GlideRecord positioned on an \`sp_menu\` row.
     * @returns URL fragment string (e.g. \`"?id=kb_home"\`).
     */
    getMenuHREF(gr: GlideRecord): string;

    /**
     * Returns the menu item rows for a portal instance, ordered and filtered for
     * the current user's roles.
     *
     * @param sysId \`sys_id\` of the \`sp_instance\` menu record.
     * @returns Array of menu item objects.
     */
    getMenuItems(sysId: string): { [key: string]: any }[];

    // -------------------------------------------------------------------------
    // Request parameters
    // -------------------------------------------------------------------------

    /**
     * Returns the value of a URL query-string parameter or a POST body parameter.
     * Returns \`null\` when the parameter is absent.
     *
     * @param name Parameter key (case-sensitive).
     * @returns The parameter value, or \`null\`.
     */
    getParameter(name: string): string | null;

    // -------------------------------------------------------------------------
    // Activity stream
    // -------------------------------------------------------------------------

    /**
     * Returns the activity stream for the specified record.
     * The stream includes journal field entries (work notes, comments) and
     * field-change history.
     *
     * @param table The table name.
     * @param sysId \`sys_id\` of the record.
     * @returns {@link SpStreamObject} with entries and metadata.
     */
    getStream(table: string, sysId: string): SpStreamObject;

    // -------------------------------------------------------------------------
    // User
    // -------------------------------------------------------------------------

    /**
     * Returns the current user's initials derived from their first and last name.
     * @returns Initials string (e.g. \`"JD"\` for John Doe).
     */
    getUserInitials(): string;

    // -------------------------------------------------------------------------
    // Widget embedding
    // -------------------------------------------------------------------------

    /**
     * Returns a fully rendered widget model for embedding inside this widget's
     * server script. Pass the result to the \`<sp-widget model="...">\` directive
     * in the HTML template.
     *
     * @param widgetId The \`widget_id\` slug or \`sys_id\` of the widget to embed.
     * @param options Optional key-value overrides for the embedded widget's options.
     * @returns Widget model object containing \`template\`, \`data\`, \`options\`, and \`css\`.
     */
    getWidget(widgetId: string, options?: { [key: string]: any }): { [key: string]: any };

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    /**
     * Writes a row to \`sp_log\` for auditing portal user actions.
     * Common types: \`"search"\`, \`"view"\`, \`"click"\`, \`"purchase"\`.
     *
     * @param type A string identifying the action type.
     * @param table The name of the related table (e.g. \`"kb_knowledge"\`).
     * @param id \`sys_id\` of the related record.
     * @param comments Optional free-text notes appended to the log entry.
     */
    logStat(type: string, table: string, id: string, comments?: string): void;
};
`;
})();
