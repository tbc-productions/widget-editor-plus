/**
 * ============================================================================
 * UI Script: monaco_language_client
 * ============================================================================
 * Purpose: Ambient TypeScript declarations for AngularJS, jQuery, and
 * ServiceNow client-side APIs, so Monaco's TS/JS language service gives
 * accurate completions/hover/signature help in client_script, link, and
 * Angular-provider editors.
 *
 * Contains:
 *   - Vendored AngularJS 1.x + jQuery ambient declarations (adapted from
 *     DefinitelyTyped's angular.d.ts / jquery.d.ts)
 *   - ServiceNow client API declarations: GlideForm, GlideUser, GlideAjax,
 *     GlideModal(Form), GlideDialogWindow, GlideList(2), GlideRecord (client),
 *     spUtil, spModal, spAriaUtil, spContextManager, and more
 *   - window.MONACO_LANGUAGE_CLIENT_DTS — the declaration string, injected
 *     via loadClientMonarchDts() in monaco_plus_core
 *   - window.MONACO_LANGUAGE_CLIENT_DI — DI token → type map and the
 *     'declare var api' signature builder used for name-based Angular
 *     injection typing on the widget api object
 * ============================================================================
 */
(function () {
    'use strict';

    window.MONACO_LANGUAGE_CLIENT_DTS = `// -----------------------------------------------------------------------------
// AngularJS 1.x type declarations
// -----------------------------------------------------------------------------


declare var angular: angular.IAngularStatic;

// Support for painless dependency injection
interface Function {
    $inject?: readonly string[] | undefined;
}




///////////////////////////////////////////////////////////////////////////////
// ng module (angular.js)
///////////////////////////////////////////////////////////////////////////////
declare namespace angular {
    type Injectable<T extends Function> = T | Array<string | T>;

    // not directly implemented, but ensures that constructed class implements $get
    interface IServiceProviderClass {
        new(...args: any[]): IServiceProvider;
    }

    interface IServiceProviderFactory {
        (...args: any[]): IServiceProvider;
    }

    // All service providers extend this interface
    interface IServiceProvider {
        $get: any;
    }

    interface IAngularBootstrapConfig {
        strictDi?: boolean | undefined;
    }

    ///////////////////////////////////////////////////////////////////////////
    // AngularStatic
    // @see {@link https://docs.angularjs.org/api}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng} */
    interface IAngularStatic {
        bind(context: any, fn: Function, ...args: any[]): Function;

        /**
         * Use this function to manually start up angular application.
         *
         * @param element DOM element which is the root of angular application.
         * @param modules An array of modules to load into the application.
         *     Each item in the array should be the name of a predefined module or a (DI annotated)
         *     function that will be invoked by the injector as a config block.
         * @param config an object for defining configuration options for the application. The following keys are supported:
         *     - \`strictDi\`: disable automatic function annotation for the application. This is meant to assist in finding bugs which break minified code.
         */
        bootstrap(
            element: string | Element | JQuery | Document,
            modules?: Array<string | Function | any[]>,
            config?: IAngularBootstrapConfig,
        ): auto.IInjectorService;

        /**
         * Creates a deep copy of source, which should be an object or an array.
         *
         * - If no destination is supplied, a copy of the object or array is created.
         * - If a destination is provided, all of its elements (for array) or properties (for objects) are deleted and then all elements/properties from the source are copied to it.
         * - If source is not an object or array (inc. null and undefined), source is returned.
         * - If source is identical to 'destination' an exception will be thrown.
         *
         * @param source The source that will be used to make a copy. Can be any type, including primitives, null, and undefined.
         * @param destination Destination into which the source is copied. If provided, must be of the same type as source.
         */
        copy<T>(source: T, destination?: T): T;

        /**
         * Wraps a raw DOM element or HTML string as a jQuery element.
         *
         * If jQuery is available, angular.element is an alias for the jQuery function. If jQuery is not available, angular.element delegates to Angular's built-in subset of jQuery, called "jQuery lite" or "jqLite."
         */
        element: JQueryStatic;
        /**
         * Configure several aspects of error handling in AngularJS if used as a setter
         * or return the current configuration if used as a getter
         */
        errorHandlingConfig(): IErrorHandlingConfig;
        errorHandlingConfig(config: IErrorHandlingConfig): void;
        equals(value1: any, value2: any): boolean;
        extend(destination: any, ...sources: any[]): any;

        /**
         * Invokes the iterator function once for each item in obj collection, which can be either an object or an array. The iterator function is invoked with iterator(value, key), where value is the value of an object property or an array element and key is the object property key or array element index. Specifying a context for the function is optional.
         *
         * It is worth noting that .forEach does not iterate over inherited properties because it filters using the hasOwnProperty method.
         *
         * @param obj Object to iterate over.
         * @param iterator Iterator function.
         * @param context Object to become context (this) for the iterator function.
         */
        forEach<T, U extends ArrayLike<T> = T[]>(
            obj: U,
            iterator: (value: U[number], key: number, obj: U) => void,
            context?: any,
        ): U;
        /**
         * Invokes the iterator function once for each item in obj collection, which can be either an object or an array. The iterator function is invoked with iterator(value, key), where value is the value of an object property or an array element and key is the object property key or array element index. Specifying a context for the function is optional.
         *
         * It is worth noting that .forEach does not iterate over inherited properties because it filters using the hasOwnProperty method.
         *
         * @param obj Object to iterate over.
         * @param iterator Iterator function.
         * @param context Object to become context (this) for the iterator function.
         */
        forEach<T>(
            obj: { [index: string]: T },
            iterator: (value: T, key: string, obj: { [index: string]: T }) => void,
            context?: any,
        ): { [index: string]: T };
        /**
         * Invokes the iterator function once for each item in obj collection, which can be either an object or an array. The iterator function is invoked with iterator(value, key), where value is the value of an object property or an array element and key is the object property key or array element index. Specifying a context for the function is optional.
         *
         * It is worth noting that .forEach does not iterate over inherited properties because it filters using the hasOwnProperty method.
         *
         * @param obj Object to iterate over.
         * @param iterator Iterator function.
         * @param context Object to become context (this) for the iterator function.
         */
        forEach(obj: any, iterator: (value: any, key: any, obj: any) => void, context?: any): any;

        fromJson(json: string): any;
        identity<T>(arg?: T): T;
        injector(modules?: any[], strictDi?: boolean): auto.IInjectorService;
        isArray(value: any): value is any[];
        isDate(value: any): value is Date;
        isDefined(value: any): boolean;
        isElement(value: any): boolean;
        isFunction(value: any): value is Function;
        isNumber(value: any): value is number;
        isObject(value: any): value is Object;
        isObject<T>(value: any): value is T;
        isString(value: any): value is string;
        isUndefined(value: any): boolean;

        /**
         * Deeply extends the destination object dst by copying own enumerable properties from the src object(s) to dst. You can specify multiple src objects. If you want to preserve original objects, you can do so by passing an empty object as the target: var object = angular.merge({}, object1, object2).
         *
         * Unlike extend(), merge() recursively descends into object properties of source objects, performing a deep copy.
         *
         * @param dst Destination object.
         * @param src Source object(s).
         */
        merge(dst: any, ...src: any[]): any;

        /**
         * The angular.module is a global place for creating, registering and retrieving Angular modules. All modules (angular core or 3rd party) that should be available to an application must be registered using this mechanism.
         *
         * When passed two or more arguments, a new module is created. If passed only one argument, an existing module (the name passed as the first argument to module) is retrieved.
         *
         * @param name The name of the module to create or retrieve.
         * @param requires The names of modules this module depends on. If specified then new module is being created. If unspecified then the module is being retrieved for further configuration.
         * @param configFn Optional configuration function for the module.
         */
        module(
            name: string,
            requires?: string[],
            configFn?: Injectable<Function>,
        ): IModule;

        noop(...args: any[]): void;
        reloadWithDebugInfo(): void;
        toJson(obj: any, pretty?: boolean | number): string;
        version: {
            full: string;
            major: number;
            minor: number;
            dot: number;
            codeName: string;
        };

        /**
         * If window.name contains prefix NG_DEFER_BOOTSTRAP! when angular.bootstrap is called, the bootstrap process will be paused until angular.resumeBootstrap() is called.
         * @param extraModules An optional array of modules that should be added to the original list of modules that the app was about to be bootstrapped with.
         */
        resumeBootstrap?(extraModules?: string[]): auto.IInjectorService;

        /**
         * Restores the pre-1.8 behavior of jqLite that turns XHTML-like strings like
         * \`<div /><span />\` to \`<div></div><span></span>\` instead of \`<div><span></span></div>\`.
         * The new behavior is a security fix so if you use this method, please try to adjust
         * to the change & remove the call as soon as possible.
         * Note that this only patches jqLite. If you use jQuery 3.5.0 or newer, please read
         * [jQuery 3.5 upgrade guide](https://jquery.com/upgrade-guide/3.5/) for more details
         * about the workarounds.
         */
        UNSAFE_restoreLegacyJqLiteXHTMLReplacement(): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // Module
    // @see {@link https://docs.angularjs.org/api/angular.Module}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/type/angular.Module} */
    interface IModule {
        /**
         * Use this method to register a component.
         *
         * @param name The name of the component.
         * @param options A definition object passed into the component.
         */
        component(name: string, options: IComponentOptions): IModule;
        /**
         * Use this method to register a component.
         *
         * @param object Object map of components where the keys are the names and the values are the component definition objects
         */
        component(object: { [componentName: string]: IComponentOptions }): IModule;
        /**
         * Use this method to register work which needs to be performed on module loading.
         *
         * @param configFn Execute this function on module load. Useful for service configuration.
         */
        config(configFn: Function): IModule;
        /**
         * Use this method to register work which needs to be performed on module loading.
         *
         * @param inlineAnnotatedFunction Execute this function on module load. Useful for service configuration.
         */
        config(inlineAnnotatedFunction: any[]): IModule;
        config(object: Object): IModule;
        /**
         * Register a constant service, such as a string, a number, an array, an object or a function, with the $injector. Unlike value it can be injected into a module configuration function (see config) and it cannot be overridden by an Angular decorator.
         *
         * @param name The name of the constant.
         * @param value The constant value.
         */
        constant<T>(name: string, value: T): IModule;
        constant(object: Object): IModule;
        /**
         * The $controller service is used by Angular to create new controllers.
         *
         * This provider allows controller registration via the register method.
         *
         * @param name Controller name, or an object map of controllers where the keys are the names and the values are the constructors.
         * @param controllerConstructor Controller constructor fn (optionally decorated with DI annotations in the array notation).
         */
        controller(name: string, controllerConstructor: Injectable<IControllerConstructor>): IModule;
        controller(object: { [name: string]: Injectable<IControllerConstructor> }): IModule;
        /**
         * Register a new directive with the compiler.
         *
         * @param name Name of the directive in camel-case (i.e. ngBind which will match as ng-bind)
         * @param directiveFactory An injectable directive factory function.
         */
        directive<
            TScope extends IScope = IScope,
            TElement extends JQLite = JQLite,
            TAttributes extends IAttributes = IAttributes,
            TController extends IDirectiveController = IController,
        >(
            name: string,
            directiveFactory: Injectable<IDirectiveFactory<TScope, TElement, TAttributes, TController>>,
        ): IModule;
        directive<
            TScope extends IScope = IScope,
            TElement extends JQLite = JQLite,
            TAttributes extends IAttributes = IAttributes,
            TController extends IDirectiveController = IController,
        >(
            object: {
                [directiveName: string]: Injectable<IDirectiveFactory<TScope, TElement, TAttributes, TController>>;
            },
        ): IModule;

        /**
         * Register a service factory, which will be called to return the service instance. This is short for registering a service where its provider consists of only a $get property, which is the given service factory function. You should use $provide.factory(getFn) if you do not need to configure your service in a provider.
         *
         * @param name The name of the instance.
         * @param $getFn The $getFn for the instance creation. Internally this is a short hand for $provide.provider(name, {$get: $getFn}).
         */
        factory(name: string, $getFn: Injectable<Function>): IModule;
        factory(object: { [name: string]: Injectable<Function> }): IModule;
        filter(name: string, filterFactoryFunction: Injectable<FilterFactory>): IModule;
        filter(object: { [name: string]: Injectable<FilterFactory> }): IModule;
        provider(name: string, serviceProviderFactory: IServiceProviderFactory): IModule;
        provider(name: string, serviceProviderConstructor: IServiceProviderClass): IModule;
        provider(name: string, inlineAnnotatedConstructor: any[]): IModule;
        provider(name: string, providerObject: IServiceProvider): IModule;
        provider(object: Object): IModule;
        /**
         * Run blocks are the closest thing in Angular to the main method. A run block is the code which needs to run to kickstart the application. It is executed after all of the service have been configured and the injector has been created. Run blocks typically contain code which is hard to unit-test, and for this reason should be declared in isolated modules, so that they can be ignored in the unit-tests.
         */
        run(initializationFunction: Injectable<Function>): IModule;
        /**
         * Register a service constructor, which will be invoked with new to create the service instance. This is short for registering a service where its provider's $get property is a factory function that returns an instance instantiated by the injector from the service constructor function.
         *
         * @param name The name of the instance.
         * @param serviceConstructor An injectable class (constructor function) that will be instantiated.
         */
        service(name: string, serviceConstructor: Injectable<Function>): IModule;
        service(object: { [name: string]: Injectable<Function> }): IModule;
        /**
         * Register a value service with the $injector, such as a string, a number, an array, an object or a function. This is short for registering a service where its provider's $get property is a factory function that takes no arguments and returns the value service.

           Value services are similar to constant services, except that they cannot be injected into a module configuration function (see config) but they can be overridden by an Angular decorator.
         *
         * @param name The name of the instance.
         * @param value The value.
         */
        value<T>(name: string, value: T): IModule;
        value(object: Object): IModule;

        /**
         * Register a service decorator with the $injector. A service decorator intercepts the creation of a service, allowing it to override or modify the behaviour of the service. The object returned by the decorator may be the original service, or a new service object which replaces or wraps and delegates to the original service.
         * @param name The name of the service to decorate
         * @param decorator This function will be invoked when the service needs to be instantiated and should return the decorated service instance. The function is called using the injector.invoke method and is therefore fully injectable. Local injection arguments: $delegate - The original service instance, which can be monkey patched, configured, decorated or delegated to.
         */
        decorator(name: string, decorator: Injectable<Function>): IModule;

        // Properties
        name: string;
        requires: string[];
    }

    ///////////////////////////////////////////////////////////////////////////
    // Attributes
    // @see {@link https://docs.angularjs.org/api/ng/type/$compile.directive.Attributes}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/type/$compile.directive.Attributes} */
    interface IAttributes {
        /**
         * this is necessary to be able to access the scoped attributes. it's not very elegant
         * because you have to use attrs['foo'] instead of attrs.foo but I don't know of a better way
         * this should really be limited to return string but it creates this problem: http://stackoverflow.com/q/17201854/165656
         */
        [name: string]: any;

        /**
         * Converts an attribute name (e.g. dash/colon/underscore-delimited string, optionally prefixed with x- or data-) to its normalized, camelCase form.
         *
         * Also there is special case for Moz prefix starting with upper case letter.
         *
         * For further information check out the guide on @see {@link https://docs.angularjs.org/guide/directive#matching-directives}
         */
        $normalize(name: string): string;

        /**
         * Adds the CSS class value specified by the classVal parameter to the
         * element. If animations are enabled then an animation will be triggered
         * for the class addition.
         */
        $addClass(classVal: string): void;

        /**
         * Removes the CSS class value specified by the classVal parameter from the
         * element. If animations are enabled then an animation will be triggered for
         * the class removal.
         */
        $removeClass(classVal: string): void;

        /**
         * Adds and removes the appropriate CSS class values to the element based on the difference between
         * the new and old CSS class values (specified as newClasses and oldClasses).
         */
        $updateClass(newClasses: string, oldClasses: string): void;

        /**
         * Set DOM element attribute value.
         */
        $set(key: string, value: any): void;

        /**
         * Observes an interpolated attribute.
         * The observer function will be invoked once during the next $digest
         * following compilation. The observer is then invoked whenever the
         * interpolated value changes.
         */
        $observe<T>(name: string, fn: (value?: T) => any): Function;

        /**
         * A map of DOM element attribute names to the normalized name. This is needed
         * to do reverse lookup from normalized name back to actual name.
         */
        $attr: Object;
    }

    /**
     * form.FormController - type in module ng
     * @see {@link https://docs.angularjs.org/api/ng/type/form.FormController}
     */
    interface IFormController {
        /**
         * Indexer which should return ng.INgModelController for most properties but cannot because of "All named properties must be assignable to string indexer type" constraint - see https://github.com/Microsoft/TypeScript/issues/272
         */
        [name: string]: any;

        $pristine: boolean;
        $dirty: boolean;
        $valid: boolean;
        $invalid: boolean;
        $submitted: boolean;
        $error: { [validationErrorKey: string]: Array<INgModelController | IFormController> };
        $name?: string | undefined;
        $pending?: { [validationErrorKey: string]: Array<INgModelController | IFormController> } | undefined;
        $addControl(control: INgModelController | IFormController): void;
        $getControls(): ReadonlyArray<INgModelController | IFormController>;
        $removeControl(control: INgModelController | IFormController): void;
        $setValidity(validationErrorKey: string, isValid: boolean, control: INgModelController | IFormController): void;
        $setDirty(): void;
        $setPristine(): void;
        $commitViewValue(): void;
        $rollbackViewValue(): void;
        $setSubmitted(): void;
        $setUntouched(): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // NgModelController
    // @see {@link https://docs.angularjs.org/api/ng/type/ngModel.NgModelController}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/type/ngModel.NgModelController} */
    interface INgModelController {
        $render(): void;
        $setValidity(validationErrorKey: string, isValid: boolean): void;
        // Documentation states viewValue and modelValue to be a string but other
        // types do work and it's common to use them.
        $setViewValue(value: any, trigger?: string): void;
        $setPristine(): void;
        $setDirty(): void;
        $validate(): void;
        $setTouched(): void;
        $setUntouched(): void;
        $rollbackViewValue(): void;
        $commitViewValue(): void;
        $processModelValue(): void;
        $isEmpty(value: any): boolean;
        $overrideModelOptions(options: INgModelOptions): void;

        $viewValue: any;

        $modelValue: any;

        $parsers: IModelParser[];
        $formatters: IModelFormatter[];
        $viewChangeListeners: IModelViewChangeListener[];
        $error: { [validationErrorKey: string]: boolean };
        $name?: string | undefined;

        $touched: boolean;
        $untouched: boolean;

        $validators: IModelValidators;
        $asyncValidators: IAsyncModelValidators;

        $pending?: { [validationErrorKey: string]: boolean } | undefined;
        $pristine: boolean;
        $dirty: boolean;
        $valid: boolean;
        $invalid: boolean;
    }

    // Allows tuning how model updates are done.
    /** @see {@link https://docs.angularjs.org/api/ng/directive/ngModelOptions} */
    interface INgModelOptions {
        updateOn?: string | undefined;
        debounce?: number | { [key: string]: number } | undefined;
        allowInvalid?: boolean | undefined;
        getterSetter?: boolean | undefined;
        timezone?: string | undefined;
        /**
         * Defines if the time and datetime-local types should show seconds and milliseconds.
         * The option follows the format string of date filter.
         * By default, the options is undefined which is equal to 'ss.sss' (seconds and milliseconds)
         */
        timeSecondsFormat?: string | undefined;
        /**
         * Defines if the time and datetime-local types should strip the seconds and milliseconds
         * from the formatted value if they are zero. This option is applied after \`timeSecondsFormat\`
         */
        timeStripZeroSeconds?: boolean | undefined;
    }

    interface IModelValidators {
        /**
         * viewValue is any because it can be an object that is called in the view like $viewValue.name:$viewValue.subName
         */
        [index: string]: (modelValue: any, viewValue: any) => boolean;
    }

    interface IAsyncModelValidators {
        [index: string]: (modelValue: any, viewValue: any) => IPromise<any>;
    }

    interface IErrorHandlingConfig {
        /**
         * The max depth for stringifying objects.
         * Setting to a non-positive or non-numeric value, removes the max depth limit
         * @default 5
         */
        objectMaxDepth?: number | undefined;
        /**
         * Specifies whether the generated error url will contain the parameters of the thrown error.
         * Disabling the parameters can be useful if the generated error url is very long.
         * @default true;
         */
        urlErrorParamsEnabled?: boolean | undefined;
    }

    interface IModelParser {
        (value: any): any;
    }

    interface IModelFormatter {
        (value: any): any;
    }

    interface IModelViewChangeListener {
        (): void;
    }

    /**
     * $rootScope - $rootScopeProvider - service in module ng
     * @see {@link https://docs.angularjs.org/api/ng/type/$rootScope.Scope} and {@link https://docs.angularjs.org/api/ng/service/$rootScope}
     */
    interface IRootScopeService {
        $apply(): any;
        $apply(exp: string): any;
        $apply(exp: (scope: IScope) => any): any;

        $applyAsync(): any;
        $applyAsync(exp: string): any;
        $applyAsync(exp: (scope: IScope) => any): any;

        /**
         * Dispatches an event name downwards to all child scopes (and their children) notifying the registered $rootScope.Scope listeners.
         *
         * The event life cycle starts at the scope on which $broadcast was called. All listeners listening for name event on this scope get notified. Afterwards, the event propagates to all direct and indirect scopes of the current scope and calls all registered listeners along the way. The event cannot be canceled.
         *
         * Any exception emitted from the listeners will be passed onto the $exceptionHandler service.
         *
         * @param name Event name to broadcast.
         * @param args Optional one or more arguments which will be passed onto the event listeners.
         */
        $broadcast(name: string, ...args: any[]): IAngularEvent;
        $destroy(): void;
        $digest(): void;

        /**
         * Suspend watchers of this scope subtree so that they will not be invoked during digest.
         *
         * This can be used to optimize your application when you know that running those watchers
         * is redundant.
         *
         * **Warning**
         *
         * Suspending scopes from the digest cycle can have unwanted and difficult to debug results.
         * Only use this approach if you are confident that you know what you are doing and have
         * ample tests to ensure that bindings get updated as you expect.
         *
         * Some of the things to consider are:
         *
         * * Any external event on a directive/component will not trigger a digest while the hosting
         *   scope is suspended - even if the event handler calls \`$apply()\` or \`$rootScope.$digest()\`.
         * * Transcluded content exists on a scope that inherits from outside a directive but exists
         *   as a child of the directive's containing scope. If the containing scope is suspended the
         *   transcluded scope will also be suspended, even if the scope from which the transcluded
         *   scope inherits is not suspended.
         * * Multiple directives trying to manage the suspended status of a scope can confuse each other:
         *    * A call to \`$suspend()\` on an already suspended scope is a no-op.
         *    * A call to \`$resume()\` on a non-suspended scope is a no-op.
         *    * If two directives suspend a scope, then one of them resumes the scope, the scope will no
         *      longer be suspended. This could result in the other directive believing a scope to be
         *      suspended when it is not.
         * * If a parent scope is suspended then all its descendants will be also excluded from future
         *   digests whether or not they have been suspended themselves. Note that this also applies to
         *   isolate child scopes.
         * * Calling \`$digest()\` directly on a descendant of a suspended scope will still run the watchers
         *   for that scope and its descendants. When digesting we only check whether the current scope is
         *   locally suspended, rather than checking whether it has a suspended ancestor.
         * * Calling \`$resume()\` on a scope that has a suspended ancestor will not cause the scope to be
         *   included in future digests until all its ancestors have been resumed.
         * * Resolved promises, e.g. from explicit \`$q\` deferreds and \`$http\` calls, trigger \`$apply()\`
         *   against the \`$rootScope\` and so will still trigger a global digest even if the promise was
         *   initiated by a component that lives on a suspended scope.
         */
        $suspend(): void;

        /**
         * Call this method to determine if this scope has been explicitly suspended. It will not
         * tell you whether an ancestor has been suspended.
         * To determine if this scope will be excluded from a digest triggered at the $rootScope,
         * for example, you must check all its ancestors:
         *
         * \`\`\`
         * function isExcludedFromDigest(scope) {
         *   while(scope) {
         *     if (scope.$isSuspended()) return true;
         *     scope = scope.$parent;
         *   }
         *   return false;
         * \`\`\`
         *
         * Be aware that a scope may not be included in digests if it has a suspended ancestor,
         * even if \`$isSuspended()\` returns false.
         *
         * @returns true if the current scope has been suspended.
         */
        $isSuspended(): boolean;

        /**
         * Resume watchers of this scope subtree in case it was suspended.
         *
         * See {$rootScope.Scope#$suspend} for information about the dangers of using this approach.
         */
        $resume(): void;

        /**
         * Dispatches an event name upwards through the scope hierarchy notifying the registered $rootScope.Scope listeners.
         *
         * The event life cycle starts at the scope on which $emit was called. All listeners listening for name event on this scope get notified. Afterwards, the event traverses upwards toward the root scope and calls all registered listeners along the way. The event will stop propagating if one of the listeners cancels it.
         *
         * Any exception emitted from the listeners will be passed onto the $exceptionHandler service.
         *
         * @param name Event name to emit.
         * @param args Optional one or more arguments which will be passed onto the event listeners.
         */
        $emit(name: string, ...args: any[]): IAngularEvent;

        $eval(): any;
        $eval(expression: string, locals?: Object): any;
        $eval(expression: (scope: IScope) => any, locals?: Object): any;

        $evalAsync(): void;
        $evalAsync(expression: string, locals?: Object): void;
        $evalAsync(expression: (scope: IScope) => void, locals?: Object): void;

        // Defaults to false by the implementation checking strategy
        $new(isolate?: boolean, parent?: IScope): IScope;

        /**
         * Listens on events of a given type. See $emit for discussion of event life cycle.
         *
         * The event listener function format is: function(event, args...).
         *
         * @param name Event name to listen on.
         * @param listener Function to call when the event is emitted.
         */
        $on(name: string, listener: (event: IAngularEvent, ...args: any[]) => any): () => void;

        $watch(watchExpression: string, listener?: string, objectEquality?: boolean): () => void;
        $watch<T>(
            watchExpression: string,
            listener?: (newValue: T, oldValue: T, scope: IScope) => any,
            objectEquality?: boolean,
        ): () => void;
        $watch(watchExpression: (scope: IScope) => any, listener?: string, objectEquality?: boolean): () => void;
        $watch<T>(
            watchExpression: (scope: IScope) => T,
            listener?: (newValue: T, oldValue: T, scope: IScope) => any,
            objectEquality?: boolean,
        ): () => void;

        $watchCollection<T>(
            watchExpression: string,
            listener: (newValue: T, oldValue: T, scope: IScope) => any,
        ): () => void;
        $watchCollection<T>(
            watchExpression: (scope: IScope) => T,
            listener: (newValue: T, oldValue: T, scope: IScope) => any,
        ): () => void;

        $watchGroup(
            watchExpressions: any[],
            listener: (newValue: any, oldValue: any, scope: IScope) => any,
        ): () => void;
        $watchGroup(
            watchExpressions: Array<{ (scope: IScope): any }>,
            listener: (newValue: any, oldValue: any, scope: IScope) => any,
        ): () => void;

        $parent: IScope;
        $root: IRootScopeService;
        $id: number;

        // Hidden members
        $$isolateBindings: any;
        $$phase: any;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/type/$rootScope.Scope} */
    interface IScope extends IRootScopeService {}

    /**
     * $scope for ngRepeat directive.
     * @see {@link https://docs.angularjs.org/api/ng/directive/ngRepeat}
     */
    interface IRepeatScope extends IScope {
        /**
         * iterator offset of the repeated element (0..length-1).
         */
        $index: number;

        /**
         * true if the repeated element is first in the iterator.
         */
        $first: boolean;

        /**
         * true if the repeated element is between the first and last in the iterator.
         */
        $middle: boolean;

        /**
         * true if the repeated element is last in the iterator.
         */
        $last: boolean;

        /**
         * true if the iterator position $index is even (otherwise false).
         */
        $even: boolean;

        /**
         * true if the iterator position $index is odd (otherwise false).
         */
        $odd: boolean;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/type/$rootScope.Scope#$on} */
    interface IAngularEvent {
        /**
         * the scope on which the event was $emit-ed or $broadcast-ed.
         */
        targetScope: IScope;
        /**
         * the scope that is currently handling the event. Once the event propagates through the scope hierarchy, this property is set to null.
         */
        currentScope: IScope;
        /**
         * name of the event.
         */
        name: string;
        /**
         * calling stopPropagation function will cancel further event propagation (available only for events that were $emit-ed).
         */
        stopPropagation?(): void;
        /**
         * calling preventDefault sets defaultPrevented flag to true.
         */
        preventDefault(): void;
        /**
         * true if preventDefault was called.
         */
        defaultPrevented: boolean;
    }

    ///////////////////////////////////////////////////////////////////////////
    // WindowService
    // @see {@link https://docs.angularjs.org/api/ng/service/$window}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$window} */
    interface IWindowService extends Window {
        [key: string]: any;
    }

    ///////////////////////////////////////////////////////////////////////////
    // TimeoutService
    // @see {@link https://docs.angularjs.org/api/ng/service/$timeout}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$timeout} */
    interface ITimeoutService {
        (delay?: number, invokeApply?: boolean): IPromise<void>;
        <T>(
            fn: (...args: any[]) => T | IPromise<T>,
            delay?: number,
            invokeApply?: boolean,
            ...args: any[]
        ): IPromise<T>;
        cancel(promise?: IPromise<any>): boolean;
    }

    ///////////////////////////////////////////////////////////////////////////
    // IntervalService
    // @see {@link https://docs.angularjs.org/api/ng/service/$interval}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$interval} */
    interface IIntervalService {
        (func: Function, delay: number, count?: number, invokeApply?: boolean, ...args: any[]): IPromise<any>;
        cancel(promise: IPromise<any>): boolean;
    }

    /**
     * $filter - $filterProvider - service in module ng
     *
     * Filters are used for formatting data displayed to the user.
     *
     * @see {@link https://docs.angularjs.org/api/ng/service/$filter}
     */
    interface IFilterService {
        (name: "filter"): IFilterFilter;
        (name: "currency"): IFilterCurrency;
        (name: "number"): IFilterNumber;
        (name: "date"): IFilterDate;
        (name: "json"): IFilterJson;
        (name: "lowercase"): IFilterLowercase;
        (name: "uppercase"): IFilterUppercase;
        (name: "limitTo"): IFilterLimitTo;
        (name: "orderBy"): IFilterOrderBy;
        /**
         * Usage:
         * $filter(name);
         *
         * @param name Name of the filter function to retrieve
         */
        <T>(name: string): T;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/filter} */
    interface IFilterFilter {
        <T>(
            array: T[],
            expression: string | IFilterFilterPatternObject | IFilterFilterPredicateFunc<T>,
            comparator?: IFilterFilterComparatorFunc<T> | boolean,
        ): T[];
    }

    interface IFilterFilterPatternObject {
        [name: string]: any;
    }

    interface IFilterFilterPredicateFunc<T> {
        (value: T, index: number, array: T[]): boolean;
    }

    interface IFilterFilterComparatorFunc<T> {
        (actual: T, expected: T): boolean;
    }

    interface IFilterOrderByItem {
        value: any;
        type: string;
        index: any;
    }

    interface IFilterOrderByComparatorFunc {
        (left: IFilterOrderByItem, right: IFilterOrderByItem): -1 | 0 | 1;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/currency} */
    interface IFilterCurrency {
        /**
         * Formats a number as a currency (ie $1,234.56). When no currency symbol is provided, default symbol for current locale is used.
         * @param amount Input to filter.
         * @param symbol Currency symbol or identifier to be displayed.
         * @param fractionSize Number of decimal places to round the amount to, defaults to default max fraction size for current locale
         * @return Formatted number
         */
        (amount: number, symbol?: string, fractionSize?: number): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/number} */
    interface IFilterNumber {
        /**
         * Formats a number as text.
         * @param number Number to format.
         * @param fractionSize Number of decimal places to round the number to. If this is not provided then the fraction size is computed from the current locale's number formatting pattern. In the case of the default locale, it will be 3.
         * @return Number rounded to decimalPlaces and places a “,” after each third digit.
         */
        (value: number | string, fractionSize?: number | string): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/date} */
    interface IFilterDate {
        /**
         * Formats date to a string based on the requested format.
         *
         * @param date Date to format either as Date object, milliseconds (string or number) or various ISO 8601 datetime string formats (e.g. yyyy-MM-ddTHH:mm:ss.sssZ and its shorter versions like yyyy-MM-ddTHH:mmZ, yyyy-MM-dd or yyyyMMddTHHmmssZ). If no timezone is specified in the string input, the time is considered to be in the local timezone.
         * @param format Formatting rules (see Description). If not specified, mediumDate is used.
         * @param timezone Timezone to be used for formatting. It understands UTC/GMT and the continental US time zone abbreviations, but for general use, use a time zone offset, for example, '+0430' (4 hours, 30 minutes east of the Greenwich meridian) If not specified, the timezone of the browser will be used.
         * @return Formatted string or the input if input is not recognized as date/millis.
         */
        (date: Date | number | string, format?: string, timezone?: string): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/json} */
    interface IFilterJson {
        /**
         * Allows you to convert a JavaScript object into JSON string.
         * @param object Any JavaScript object (including arrays and primitive types) to filter.
         * @param spacing The number of spaces to use per indentation, defaults to 2.
         * @return JSON string.
         */
        (object: any, spacing?: number): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/lowercase} */
    interface IFilterLowercase {
        /**
         * Converts string to lowercase.
         */
        (value: string): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/uppercase} */
    interface IFilterUppercase {
        /**
         * Converts string to uppercase.
         */
        (value: string): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/limitTo} */
    interface IFilterLimitTo {
        /**
         * Creates a new array containing only a specified number of elements. The elements are taken from either the beginning or the end of the source array, string or number, as specified by the value and sign (positive or negative) of limit.
         * @param input Source array to be limited.
         * @param limit The length of the returned array. If the limit number is positive, limit number of items from the beginning of the source array/string are copied. If the number is negative, limit number of items from the end of the source array are copied. The limit will be trimmed if it exceeds array.length. If limit is undefined, the input will be returned unchanged.
         * @param begin Index at which to begin limitation. As a negative index, begin indicates an offset from the end of input. Defaults to 0.
         * @return A new sub-array of length limit or less if input array had less than limit elements.
         */
        <T>(input: T[], limit: string | number, begin?: string | number): T[];
        /**
         * Creates a new string containing only a specified number of elements. The elements are taken from either the beginning or the end of the source string or number, as specified by the value and sign (positive or negative) of limit. If a number is used as input, it is converted to a string.
         * @param input Source string or number to be limited.
         * @param limit The length of the returned string. If the limit number is positive, limit number of items from the beginning of the source string are copied. If the number is negative, limit number of items from the end of the source string are copied. The limit will be trimmed if it exceeds input.length. If limit is undefined, the input will be returned unchanged.
         * @param begin Index at which to begin limitation. As a negative index, begin indicates an offset from the end of input. Defaults to 0.
         * @return A new substring of length limit or less if input had less than limit elements.
         */
        (input: string | number, limit: string | number, begin?: string | number): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/filter/orderBy} */
    interface IFilterOrderBy {
        /**
         * Orders a specified array by the expression predicate. It is ordered alphabetically for strings and numerically for numbers. Note: if you notice numbers are not being sorted as expected, make sure they are actually being saved as numbers and not strings.
         * @param array The array to sort.
         * @param expression A predicate to be used by the comparator to determine the order of elements.
         * @param reverse Reverse the order of the array.
         * @param comparator Function used to determine the relative order of value pairs.
         * @return An array containing the items from the specified collection, ordered by a comparator function based on the values computed using the expression predicate.
         */
        <T>(
            array: T[],
            expression: string | ((value: T) => any) | Array<((value: T) => any) | string>,
            reverse?: boolean,
            comparator?: IFilterOrderByComparatorFunc,
        ): T[];
    }

    /**
     * $filterProvider - $filter - provider in module ng
     *
     * Filters are just functions which transform input to an output. However filters need to be Dependency Injected. To achieve this a filter definition consists of a factory function which is annotated with dependencies and is responsible for creating a filter function.
     *
     * @see {@link https://docs.angularjs.org/api/ng/provider/$filterProvider}
     */
    interface IFilterProvider extends IServiceProvider {
        /**
         * register(name);
         *
         * @param name Name of the filter function, or an object map of filters where the keys are the filter names and the values are the filter factories. Note: Filter names must be valid angular Expressions identifiers, such as uppercase or orderBy. Names with special characters, such as hyphens and dots, are not allowed. If you wish to namespace your filters, then you can use capitalization (myappSubsectionFilterx) or underscores (myapp_subsection_filterx).
         */
        register(name: string | {}): IServiceProvider;
    }

    ///////////////////////////////////////////////////////////////////////////
    // LocaleService
    // @see {@link https://docs.angularjs.org/api/ng/service/$locale}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$locale} */
    interface ILocaleService {
        id: string;

        // These are not documented
        // Check angular's i18n files for exemples
        NUMBER_FORMATS: ILocaleNumberFormatDescriptor;
        DATETIME_FORMATS: ILocaleDateTimeFormatDescriptor;
        pluralCat(num: any): string;
    }

    interface ILocaleNumberFormatDescriptor {
        DECIMAL_SEP: string;
        GROUP_SEP: string;
        PATTERNS: ILocaleNumberPatternDescriptor[];
        CURRENCY_SYM: string;
    }

    interface ILocaleNumberPatternDescriptor {
        minInt: number;
        minFrac: number;
        maxFrac: number;
        posPre: string;
        posSuf: string;
        negPre: string;
        negSuf: string;
        gSize: number;
        lgSize: number;
    }

    interface ILocaleDateTimeFormatDescriptor {
        MONTH: string[];
        SHORTMONTH: string[];
        DAY: string[];
        SHORTDAY: string[];
        AMPMS: string[];
        medium: string;
        short: string;
        fullDate: string;
        longDate: string;
        mediumDate: string;
        shortDate: string;
        mediumTime: string;
        shortTime: string;
    }

    ///////////////////////////////////////////////////////////////////////////
    // LogService
    // @see {@link https://docs.angularjs.org/api/ng/service/$log}
    // @see {@link https://docs.angularjs.org/api/ng/provider/$logProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$log} */
    interface ILogService {
        debug: ILogCall;
        error: ILogCall;
        info: ILogCall;
        log: ILogCall;
        warn: ILogCall;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$logProvider} */
    interface ILogProvider extends IServiceProvider {
        debugEnabled(): boolean;
        debugEnabled(enabled: boolean): ILogProvider;
    }

    // We define this as separate interface so we can reopen it later for
    // the ngMock module.
    interface ILogCall {
        (...args: any[]): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // ParseService
    // @see {@link https://docs.angularjs.org/api/ng/service/$parse}
    // @see {@link https://docs.angularjs.org/api/ng/provider/$parseProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$parse} */
    interface IParseService {
        (
            expression: string,
            interceptorFn?: (value: any, scope: IScope, locals: any) => any,
            expensiveChecks?: boolean,
        ): ICompiledExpression;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$parseProvider} */
    interface IParseProvider {
        logPromiseWarnings(): boolean;
        logPromiseWarnings(value: boolean): IParseProvider;

        unwrapPromises(): boolean;
        unwrapPromises(value: boolean): IParseProvider;

        /**
         * Configure $parse service to add literal values that will be present as literal at expressions.
         *
         * @param literalName Token for the literal value. The literal name value must be a valid literal name.
         * @param literalValue Value for this literal. All literal values must be primitives or \`undefined\`.
         */
        addLiteral(literalName: string, literalValue: any): void;

        /**
         * Allows defining the set of characters that are allowed in Angular expressions. The function identifierStart will get called to know if a given character is a valid character to be the first character for an identifier. The function identifierContinue will get called to know if a given character is a valid character to be a follow-up identifier character. The functions identifierStart and identifierContinue will receive as arguments the single character to be identifier and the character code point. These arguments will be string and numeric. Keep in mind that the string parameter can be two characters long depending on the character representation. It is expected for the function to return true or false, whether that character is allowed or not.
         * Since this function will be called extensivelly, keep the implementation of these functions fast, as the performance of these functions have a direct impact on the expressions parsing speed.
         *
         * @param identifierStart The function that will decide whether the given character is a valid identifier start character.
         * @param identifierContinue The function that will decide whether the given character is a valid identifier continue character.
         */
        setIdentifierFns(
            identifierStart?: (character: string, codePoint: number) => boolean,
            identifierContinue?: (character: string, codePoint: number) => boolean,
        ): void;
    }

    interface ICompiledExpression {
        (context: any, locals?: any): any;

        literal: boolean;
        constant: boolean;

        // If value is not provided, undefined is gonna be used since the implementation
        // does not check the parameter. Let's force a value for consistency. If consumer
        // whants to undefine it, pass the undefined value explicitly.
        assign(context: any, value: any): any;
    }

    /**
     * $location - $locationProvider - service in module ng
     * @see {@link https://docs.angularjs.org/api/ng/service/$location}
     */
    interface ILocationService {
        absUrl(): string;

        /**
         * Returns the hash fragment
         */
        hash(): string;

        /**
         * Changes the hash fragment and returns \`$location\`
         */
        hash(newHash: string | null): ILocationService;

        host(): string;

        /**
         * Return path of current url
         */
        path(): string;

        /**
         * Change path when called with parameter and return $location.
         * Note: Path should always begin with forward slash (/), this method will add the forward slash if it is missing.
         *
         * @param path New path
         */
        path(path: string): ILocationService;

        port(): number;
        protocol(): string;
        replace(): ILocationService;

        /**
         * Return search part (as object) of current url
         */
        search(): any;

        /**
         * Change search part when called with parameter and return $location.
         *
         * @param search When called with a single argument the method acts as a setter, setting the search component of $location to the specified value.
         *
         * If the argument is a hash object containing an array of values, these values will be encoded as duplicate search parameters in the url.
         */
        search(search: any): ILocationService;

        /**
         * Change search part when called with parameter and return $location.
         *
         * @param search New search params
         * @param paramValue If search is a string or a Number, then paramValue will override only a single search property. If paramValue is null, the property specified via the first argument will be deleted. If paramValue is an array, it will override the property of the search component of $location specified via the first argument. If paramValue is true, the property specified via the first argument will be added with no value nor trailing equal sign.
         */
        search(search: string, paramValue: string | number | null | string[] | boolean): ILocationService;

        state(): any;
        state(state: any): ILocationService;
        url(): string;
        url(url: string): ILocationService;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$locationProvider} */
    interface ILocationProvider extends IServiceProvider {
        hashPrefix(): string;
        hashPrefix(prefix: string): ILocationProvider;
        html5Mode(): boolean;

        // Documentation states that parameter is string, but
        // implementation tests it as boolean, which makes more sense
        // since this is a toggler
        html5Mode(active: boolean): ILocationProvider;
        html5Mode(
            mode: {
                enabled?: boolean | undefined;
                requireBase?: boolean | undefined;
                rewriteLinks?: boolean | undefined;
            },
        ): ILocationProvider;
    }

    ///////////////////////////////////////////////////////////////////////////
    // DocumentService
    // @see {@link https://docs.angularjs.org/api/ng/service/$document}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$document} */
    interface IDocumentService extends JQLite {
        // Must return intersection type for index signature compatibility with JQuery
        [index: number]: HTMLElement & Document;
    }

    ///////////////////////////////////////////////////////////////////////////
    // ExceptionHandlerService
    // @see {@link https://docs.angularjs.org/api/ng/service/$exceptionHandler}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$exceptionHandler} */
    interface IExceptionHandlerService {
        (exception: Error, cause?: string): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // RootElementService
    // @see {@link https://docs.angularjs.org/api/ng/service/$rootElement}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$rootElement} */
    interface IRootElementService extends JQLite {}

    interface IQResolveReject<T> {
        (): void;
        (value: T): void;
    }
    /**
     * $q - service in module ng
     * A promise/deferred implementation inspired by Kris Kowal's Q.
     * @see {@link https://docs.angularjs.org/api/ng/service/$q}
     */
    interface IQService {
        new<T>(resolver: (resolve: IQResolveReject<T>, reject: IQResolveReject<any>) => any): IPromise<T>;
        <T>(resolver: (resolve: IQResolveReject<T>, reject: IQResolveReject<any>) => any): IPromise<T>;

        /**
         * Combines multiple promises into a single promise that is resolved when all of the input promises are resolved.
         *
         * Returns a single promise that will be resolved with an array of values, each value corresponding to the promise at the same index in the promises array. If any of the promises is resolved with a rejection, this resulting promise will be rejected with the same rejection value.
         *
         * @param promises An array of promises.
         */
        all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
            values: [
                T1 | IPromise<T1>,
                T2 | IPromise<T2>,
                T3 | IPromise<T3>,
                T4 | IPromise<T4>,
                T5 | IPromise<T5>,
                T6 | IPromise<T6>,
                T7 | IPromise<T7>,
                T8 | IPromise<T8>,
                T9 | IPromise<T9>,
                T10 | IPromise<T10>,
            ],
        ): IPromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
        all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(
            values: [
                T1 | IPromise<T1>,
                T2 | IPromise<T2>,
                T3 | IPromise<T3>,
                T4 | IPromise<T4>,
                T5 | IPromise<T5>,
                T6 | IPromise<T6>,
                T7 | IPromise<T7>,
                T8 | IPromise<T8>,
                T9 | IPromise<T9>,
            ],
        ): IPromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
        all<T1, T2, T3, T4, T5, T6, T7, T8>(
            values: [
                T1 | IPromise<T1>,
                T2 | IPromise<T2>,
                T3 | IPromise<T3>,
                T4 | IPromise<T4>,
                T5 | IPromise<T5>,
                T6 | IPromise<T6>,
                T7 | IPromise<T7>,
                T8 | IPromise<T8>,
            ],
        ): IPromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
        all<T1, T2, T3, T4, T5, T6, T7>(
            values: [
                T1 | IPromise<T1>,
                T2 | IPromise<T2>,
                T3 | IPromise<T3>,
                T4 | IPromise<T4>,
                T5 | IPromise<T5>,
                T6 | IPromise<T6>,
                T7 | IPromise<T7>,
            ],
        ): IPromise<[T1, T2, T3, T4, T5, T6, T7]>;
        all<T1, T2, T3, T4, T5, T6>(
            values: [
                T1 | IPromise<T1>,
                T2 | IPromise<T2>,
                T3 | IPromise<T3>,
                T4 | IPromise<T4>,
                T5 | IPromise<T5>,
                T6 | IPromise<T6>,
            ],
        ): IPromise<[T1, T2, T3, T4, T5, T6]>;
        all<T1, T2, T3, T4, T5>(
            values: [T1 | IPromise<T1>, T2 | IPromise<T2>, T3 | IPromise<T3>, T4 | IPromise<T4>, T5 | IPromise<T5>],
        ): IPromise<[T1, T2, T3, T4, T5]>;
        all<T1, T2, T3, T4>(
            values: [T1 | IPromise<T1>, T2 | IPromise<T2>, T3 | IPromise<T3>, T4 | IPromise<T4>],
        ): IPromise<[T1, T2, T3, T4]>;
        all<T1, T2, T3>(values: [T1 | IPromise<T1>, T2 | IPromise<T2>, T3 | IPromise<T3>]): IPromise<[T1, T2, T3]>;
        all<T1, T2>(values: [T1 | IPromise<T1>, T2 | IPromise<T2>]): IPromise<[T1, T2]>;
        all<TAll>(promises: Array<TAll | IPromise<TAll>>): IPromise<TAll[]>;
        /**
         * Combines multiple promises into a single promise that is resolved when all of the input promises are resolved.
         *
         * Returns a single promise that will be resolved with a hash of values, each value corresponding to the promise at the same key in the promises hash. If any of the promises is resolved with a rejection, this resulting promise will be rejected with the same rejection value.
         *
         * @param promises A hash of promises.
         */
        all<T>(promises: { [K in keyof T]: (IPromise<T[K]> | T[K]) }): IPromise<T>;
        /**
         * Creates a Deferred object which represents a task which will finish in the future.
         */
        defer<T>(): IDeferred<T>;
        /**
         * Returns a promise that resolves or rejects as soon as one of those promises resolves or rejects, with the value or reason from that promise.
         *
         * @param promises A list or hash of promises.
         */
        race<T>(promises: Array<IPromise<T>> | { [key: string]: IPromise<T> }): IPromise<T>;
        /**
         * Creates a promise that is resolved as rejected with the specified reason. This api should be used to forward rejection in a chain of promises. If you are dealing with the last promise in a promise chain, you don't need to worry about it.
         *
         * When comparing deferreds/promises to the familiar behavior of try/catch/throw, think of reject as the throw keyword in JavaScript. This also means that if you "catch" an error via a promise error callback and you want to forward the error to the promise derived from the current promise, you have to "rethrow" the error by returning a rejection constructed via reject.
         *
         * @param reason Constant, message, exception or an object representing the rejection reason.
         */
        reject(reason?: any): IPromise<never>;
        /**
         * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise. This is useful when you are dealing with an object that might or might not be a promise, or if the promise comes from a source that can't be trusted.
         *
         * @param value Value or a promise
         */
        resolve<T>(value: PromiseLike<T> | T): IPromise<T>;
        /**
         * @deprecated Since TS 2.4, inference is stricter and no longer produces the desired type when T1 !== T2.
         * To use resolve with two different types, pass a union type to the single-type-argument overload.
         */
        resolve<T1, T2>(value: PromiseLike<T1> | T2): IPromise<T1 | T2>;
        /**
         * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise. This is useful when you are dealing with an object that might or might not be a promise, or if the promise comes from a source that can't be trusted.
         */
        resolve(): IPromise<void>;
        /**
         * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise. This is useful when you are dealing with an object that might or might not be a promise, or if the promise comes from a source that can't be trusted.
         *
         * @param value Value or a promise
         */
        when<T>(value: PromiseLike<T> | T): IPromise<T>;
        when<T1, T2>(value: PromiseLike<T1> | T2): IPromise<T1 | T2>;
        when<TResult, T>(
            value: PromiseLike<T> | T,
            successCallback: (promiseValue: T) => PromiseLike<TResult> | TResult,
        ): IPromise<TResult>;
        when<TResult, T>(
            value: T,
            successCallback: (promiseValue: T) => PromiseLike<TResult> | TResult,
            errorCallback: null | undefined | ((reason: any) => any),
            notifyCallback?: (state: any) => any,
        ): IPromise<TResult>;
        when<TResult, TResult2, T>(
            value: PromiseLike<T>,
            successCallback: (promiseValue: T) => PromiseLike<TResult> | TResult,
            errorCallback: (reason: any) => TResult2 | PromiseLike<TResult2>,
            notifyCallback?: (state: any) => any,
        ): IPromise<TResult | TResult2>;
        /**
         * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise. This is useful when you are dealing with an object that might or might not be a promise, or if the promise comes from a source that can't be trusted.
         */
        when(): IPromise<void>;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$qProvider} */
    interface IQProvider {
        /**
         * Retrieves or overrides whether to generate an error when a rejected promise is not handled.
         * This feature is enabled by default.
         *
         * @returns Current value
         */
        errorOnUnhandledRejections(): boolean;

        /**
         * Retrieves or overrides whether to generate an error when a rejected promise is not handled.
         * This feature is enabled by default.
         *
         * @param value Whether to generate an error when a rejected promise is not handled.
         * @returns Self for chaining otherwise.
         */
        errorOnUnhandledRejections(value: boolean): IQProvider;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/service/$q#the-promise-api} */
    interface IPromise<T> {
        /**
         * Regardless of when the promise was or will be resolved or rejected, then calls one of
         * the success or error callbacks asynchronously as soon as the result is available. The
         * callbacks are called with a single argument: the result or rejection reason.
         * Additionally, the notify callback may be called zero or more times to provide a
         * progress indication, before the promise is resolved or rejected.
         * The \`successCallBack\` may return \`IPromise<never>\` for when a \`$q.reject()\` needs to
         * be returned.
         * This method returns a new promise which is resolved or rejected via the return value
         * of the \`successCallback\`, \`errorCallback\`. It also notifies via the return value of
         * the \`notifyCallback\` method. The promise can not be resolved or rejected from the
         * \`notifyCallback\` method.
         */
        then<TResult1 = T, TResult2 = never>(
            successCallback?:
                | ((value: T) => PromiseLike<never> | PromiseLike<TResult1> | TResult1)
                | null,
            errorCallback?:
                | ((reason: any) => PromiseLike<never> | PromiseLike<TResult2> | TResult2)
                | null,
            notifyCallback?: (state: any) => any,
        ): IPromise<TResult1 | TResult2>;
        then<TResult1 = T, TResult2 = never>(
            successCallback?:
                | ((value: T) => IPromise<never> | IPromise<TResult1> | TResult1)
                | null,
            errorCallback?:
                | ((reason: any) => IPromise<never> | IPromise<TResult2> | TResult2)
                | null,
            notifyCallback?: (state: any) => any,
        ): IPromise<TResult1 | TResult2>;

        /**
         * Shorthand for promise.then(null, errorCallback)
         */
        catch<TResult = never>(
            onRejected?:
                | ((reason: any) => PromiseLike<never> | PromiseLike<TResult> | TResult)
                | null,
        ): IPromise<T | TResult>;
        catch<TResult = never>(
            onRejected?:
                | ((reason: any) => IPromise<never> | IPromise<TResult> | TResult)
                | null,
        ): IPromise<T | TResult>;

        /**
         * Allows you to observe either the fulfillment or rejection of a promise, but to do so without modifying the final value. This is useful to release resources or do some clean-up that needs to be done whether the promise was rejected or resolved. See the full specification for more information.
         *
         * Because finally is a reserved word in JavaScript and reserved keywords are not supported as property names by ES3, you'll need to invoke the method like promise['finally'](callback) to make your code IE8 and Android 2.x compatible.
         */
        finally(finallyCallback: () => void): IPromise<T>;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/service/$q#the-deferred-api} */
    interface IDeferred<T> {
        resolve(value?: T | IPromise<T>): void;
        reject(reason?: any): void;
        notify(state?: any): void;
        promise: IPromise<T>;
    }

    ///////////////////////////////////////////////////////////////////////////
    // AnchorScrollService
    // @see {@link https://docs.angularjs.org/api/ng/service/$anchorScroll}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$anchorScroll} */
    interface IAnchorScrollService {
        (): void;
        (hash: string): void;
        yOffset: any;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$anchorScrollProvider} */
    interface IAnchorScrollProvider extends IServiceProvider {
        disableAutoScrolling(): void;
    }

    /**
     * $animate - service in module ng (no-op core version; full CSS/JS
     * transitions require the ngAnimate module).
     * @see {@link https://docs.angularjs.org/api/ng/service/$animate}
     */
    interface IAnimateService {
        /** Sets up an event listener to fire whenever the animation event has fired on the given element. */
        on(event: string, container: JQLite, callback: (element?: JQLite, phase?: string) => any): void;
        /** Deregisters event listeners registered with $animate.on(). */
        off(event: string, container?: JQLite, callback?: (element?: JQLite, phase?: string) => any): void;
        /** Associates the provided element with a host parent element to allow the element to be animated even if it exists outside of the DOM structure of the AngularJS application. */
        pin(element: JQLite, parentElement: JQLite): void;
        /** Globally enables/disables animations, or enables/disables them on the given element. */
        enabled(enabled?: boolean): boolean;
        enabled(element: JQLite, enabled?: boolean): boolean;
        /** Cancels the provided animation. */
        cancel(animationPromise: IPromise<any>): void;
        /** Inserts the element into the DOM either after the 'after' element (if provided) or as the first child within the parent element, then runs the enter animation. */
        enter(element: JQLite, parent: JQLite, after?: JQLite, options?: object): IPromise<any>;
        /** Moves the element to the position within the DOM, then runs the move animation. */
        move(element: JQLite, parent: JQLite, after?: JQLite): IPromise<any>;
        /** Runs the leave animation, then removes the element from the DOM. */
        leave(element: JQLite, options?: object): IPromise<any>;
        /** Adds the provided CSS class(es), running an animation for the change. */
        addClass(element: JQLite, className: string, options?: object): IPromise<any>;
        /** Removes the provided CSS class(es), running an animation for the change. */
        removeClass(element: JQLite, className: string, options?: object): IPromise<any>;
        /** Adds and/or removes the given CSS classes, running an animation for the change. */
        setClass(element: JQLite, add: string, remove: string, options?: object): IPromise<any>;
        /** Performs an inline animation on the element, applying the provided 'from' and 'to' styles. */
        animate(element: JQLite, from: object, to: object, className?: string, options?: object): IPromise<any>;
    }

    /**
     * $cacheFactory - service in module ng
     *
     * Factory that constructs Cache objects and gives access to them.
     *
     * @see {@link https://docs.angularjs.org/api/ng/service/$cacheFactory}
     */
    interface ICacheFactoryService {
        /**
         * Factory that constructs Cache objects and gives access to them.
         *
         * @param cacheId Name or id of the newly created cache.
         * @param optionsMap Options object that specifies the cache behavior. Properties:
         *
         * capacity — turns the cache into LRU cache.
         */
        (cacheId: string, optionsMap?: { capacity?: number | undefined }): ICacheObject;

        /**
         * Get information about all the caches that have been created.
         * @returns key-value map of cacheId to the result of calling cache#info
         */
        info(): any;

        /**
         * Get access to a cache object by the cacheId used when it was created.
         *
         * @param cacheId Name or id of a cache to access.
         */
        get(cacheId: string): ICacheObject;
    }

    /**
     * $cacheFactory.Cache - type in module ng
     *
     * A cache object used to store and retrieve data, primarily used by $http and the script directive to cache templates and other data.
     *
     * @see {@link https://docs.angularjs.org/api/ng/type/$cacheFactory.Cache}
     */
    interface ICacheObject {
        /**
         * Retrieve information regarding a particular Cache.
         */
        info(): {
            /**
             * the id of the cache instance
             */
            id: string;

            /**
             * the number of entries kept in the cache instance
             */
            size: number;
            // ...: any additional properties from the options object when creating the cache.
        };

        /**
         * Inserts a named entry into the Cache object to be retrieved later, and incrementing the size of the cache if the key was not already present in the cache. If behaving like an LRU cache, it will also remove stale entries from the set.
         *
         * It will not insert undefined values into the cache.
         *
         * @param key the key under which the cached data is stored.
         * @param value the value to store alongside the key. If it is undefined, the key will not be stored.
         */
        put<T>(key: string, value?: T): T;

        /**
         * Retrieves named data stored in the Cache object.
         *
         * @param key the key of the data to be retrieved
         */
        get<T>(key: string): T | undefined;

        /**
         * Removes an entry from the Cache object.
         *
         * @param key the key of the entry to be removed
         */
        remove(key: string): void;

        /**
         * Clears the cache object of any entries.
         */
        removeAll(): void;

        /**
         * Destroys the Cache object entirely, removing it from the $cacheFactory set.
         */
        destroy(): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // CompileService
    // @see {@link https://docs.angularjs.org/api/ng/service/$compile}
    // @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$compile} */
    interface ICompileService {
        (
            element: string | Element | JQuery,
            transclude?: ITranscludeFunction,
            maxPriority?: number,
        ): ITemplateLinkingFunction;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider} */
    interface ICompileProvider extends IServiceProvider {
        directive<
            TScope extends IScope = IScope,
            TElement extends JQLite = JQLite,
            TAttributes extends IAttributes = IAttributes,
            TController extends IDirectiveController = IController,
        >(
            name: string,
            directiveFactory: Injectable<IDirectiveFactory<TScope, TElement, TAttributes, TController>>,
        ): ICompileProvider;
        directive<
            TScope extends IScope = IScope,
            TElement extends JQLite = JQLite,
            TAttributes extends IAttributes = IAttributes,
            TController extends IDirectiveController = IController,
        >(
            object: {
                [directiveName: string]: Injectable<IDirectiveFactory<TScope, TElement, TAttributes, TController>>;
            },
        ): ICompileProvider;

        component(name: string, options: IComponentOptions): ICompileProvider;
        component(object: { [componentName: string]: IComponentOptions }): ICompileProvider;

        /** @deprecated The old name of aHrefSanitizationTrustedUrlList. Kept for compatibility. */
        aHrefSanitizationWhitelist(): RegExp;
        /** @deprecated The old name of aHrefSanitizationTrustedUrlList. Kept for compatibility. */
        aHrefSanitizationWhitelist(regexp: RegExp): ICompileProvider;

        aHrefSanitizationTrustedUrlList(): RegExp;
        aHrefSanitizationTrustedUrlList(regexp: RegExp): ICompileProvider;

        /** @deprecated The old name of imgSrcSanitizationTrustedUrlList. Kept for compatibility. */
        imgSrcSanitizationWhitelist(): RegExp;
        /** @deprecated The old name of imgSrcSanitizationTrustedUrlList. Kept for compatibility. */
        imgSrcSanitizationWhitelist(regexp: RegExp): ICompileProvider;

        imgSrcSanitizationTrustedUrlList(): RegExp;
        imgSrcSanitizationTrustedUrlList(regexp: RegExp): ICompileProvider;

        debugInfoEnabled(): boolean;
        debugInfoEnabled(enabled: boolean): ICompileProvider;

        /**
         * Sets the number of times $onChanges hooks can trigger new changes before giving up and assuming that the model is unstable.
         * Increasing the TTL could have performance implications, so you should not change it without proper justification.
         * Default: 10.
         * @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#onChangesTtl}
         */
        onChangesTtl(): number;
        onChangesTtl(limit: number): ICompileProvider;

        /**
         * It indicates to the compiler whether or not directives on comments should be compiled.
         * It results in a compilation performance gain since the compiler doesn't have to check comments when looking for directives.
         * Defaults to true.
         * @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#commentDirectivesEnabled}
         */
        commentDirectivesEnabled(): boolean;
        commentDirectivesEnabled(enabled: boolean): ICompileProvider;

        /**
         * It indicates to the compiler whether or not directives on element classes should be compiled.
         * It results in a compilation performance gain since the compiler doesn't have to check element classes when looking for directives.
         * Defaults to true.
         * @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#cssClassDirectivesEnabled}
         */
        cssClassDirectivesEnabled(): boolean;
        cssClassDirectivesEnabled(enabled: boolean): ICompileProvider;

        /**
         * Call this method to enable/disable strict component bindings check.
         * If enabled, the compiler will enforce that for all bindings of a
         * component that are not set as optional with ?, an attribute needs
         * to be provided on the component's HTML tag.
         * Defaults to false.
         * @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#strictComponentBindingsEnabled}
         */
        strictComponentBindingsEnabled(): boolean;
        strictComponentBindingsEnabled(enabled: boolean): ICompileProvider;
    }

    interface ICloneAttachFunction {
        // Let's hint but not force cloneAttachFn's signature
        (clonedElement?: JQLite, scope?: IScope): any;
    }

    // This corresponds to the "publicLinkFn" returned by $compile.
    interface ITemplateLinkingFunction {
        (scope: IScope, cloneAttachFn?: ICloneAttachFunction, options?: ITemplateLinkingFunctionOptions): JQLite;
    }

    interface ITemplateLinkingFunctionOptions {
        parentBoundTranscludeFn?: ITranscludeFunction | undefined;
        transcludeControllers?: {
            [controller: string]: { instance: IController };
        } | undefined;
        futureParentElement?: JQuery | undefined;
    }

    /**
     * This corresponds to $transclude passed to controllers and to the transclude function passed to link functions.
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#-controller-}
     * http://teropa.info/blog/2015/06/09/transclusion.html
     */
    interface ITranscludeFunction {
        // If the scope is provided, then the cloneAttachFn must be as well.
        (scope: IScope, cloneAttachFn: ICloneAttachFunction, futureParentElement?: JQuery, slotName?: string): JQLite;
        // If one argument is provided, then it's assumed to be the cloneAttachFn.
        (cloneAttachFn?: ICloneAttachFunction, futureParentElement?: JQuery, slotName?: string): JQLite;

        /**
         * Returns true if the specified slot contains content (i.e. one or more DOM nodes)
         */
        isSlotFilled(slotName: string): boolean;
    }

    ///////////////////////////////////////////////////////////////////////////
    // ControllerService
    // @see {@link https://docs.angularjs.org/api/ng/service/$controller}
    // @see {@link https://docs.angularjs.org/api/ng/provider/$controllerProvider}
    ///////////////////////////////////////////////////////////////////////////

    /**
     * The minimal local definitions required by $controller(ctrl, locals) calls.
     */
    interface IControllerLocals {
        $scope: IScope;
        $element: JQuery;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/service/$controller} */
    interface IControllerService {
        // Although the documentation doesn't state this, locals are optional
        <T>(controllerConstructor: new(...args: any[]) => T, locals?: any): T;
        <T>(controllerConstructor: (...args: any[]) => T, locals?: any): T;
        <T>(controllerName: string, locals?: any): T;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$controllerProvider} */
    interface IControllerProvider extends IServiceProvider {
        register(name: string, controllerConstructor: Function): void;
        register(name: string, dependencyAnnotatedConstructor: any[]): void;
    }

    /**
     * xhrFactory
     * Replace or decorate this service to create your own custom XMLHttpRequest objects.
     * @see {@link https://docs.angularjs.org/api/ng/service/$xhrFactory}
     */
    interface IXhrFactory<T> {
        (method: string, url: string): T;
    }

    /**
     * HttpService
     * @see {@link https://docs.angularjs.org/api/ng/service/$http}
     */
    interface IHttpService {
        /**
         * Object describing the request to be made and how it should be processed.
         */
        <T>(config: IRequestConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform GET request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param config Optional configuration object
         */
        get<T>(url: string, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform DELETE request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param config Optional configuration object
         */
        delete<T>(url: string, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform HEAD request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param config Optional configuration object
         */
        head<T>(url: string, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform JSONP request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param config Optional configuration object
         */
        jsonp<T>(url: string, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform POST request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param data Request content
         * @param config Optional configuration object
         */
        post<T>(url: string, data: any, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform PUT request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param data Request content
         * @param config Optional configuration object
         */
        put<T>(url: string, data: any, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Shortcut method to perform PATCH request.
         *
         * @param url Relative or absolute URL specifying the destination of the request
         * @param data Request content
         * @param config Optional configuration object
         */
        patch<T>(url: string, data: any, config?: IRequestShortcutConfig): IHttpPromise<T>;

        /**
         * Runtime equivalent of the $httpProvider.defaults property. Allows configuration of default headers, withCredentials as well as request and response transformations.
         */
        defaults: IHttpProviderDefaults;

        /**
         * Array of config objects for currently pending requests. This is primarily meant to be used for debugging purposes.
         */
        pendingRequests: IRequestConfig[];
    }

    /**
     * Object describing the request to be made and how it should be processed.
     * @see {@link https://docs.angularjs.org/api/ng/service/$http#usage}
     */
    interface IRequestShortcutConfig extends IHttpProviderDefaults {
        /**
         * {Object.<string|Object>}
         * Map of strings or objects which will be turned to ?key1=value1&key2=value2 after the url. If the value is not a string, it will be JSONified.
         */
        params?: any;

        /**
         * {string|Object}
         * Data to be sent as the request message data.
         */
        data?: any;

        /**
         * Timeout in milliseconds, or promise that should abort the request when resolved.
         */
        timeout?: number | IPromise<any> | undefined;

        /**
         * See [XMLHttpRequest.responseType]https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest#xmlhttprequest-responsetype
         */
        responseType?: string | undefined;

        /**
         * Name of the parameter added (by AngularJS) to the request to specify the name (in the server response) of the JSON-P callback to invoke.
         * If unspecified, $http.defaults.jsonpCallbackParam will be used by default. This property is only applicable to JSON-P requests.
         */
        jsonpCallbackParam?: string | undefined;
    }

    /**
     * Object describing the request to be made and how it should be processed.
     * @see {@link https://docs.angularjs.org/api/ng/service/$http#usage}
     */
    interface IRequestConfig extends IRequestShortcutConfig {
        /**
         * HTTP method (e.g. 'GET 'POST etc)
         */
        method: string;
        /**
         * Absolute or relative URL of the resource that is being requested.
         */
        url: string;
        /**
         * Event listeners to be bound to the XMLHttpRequest object.
         * To bind events to the XMLHttpRequest upload object, use uploadEventHandlers. The handler will be called in the context of a $apply block.
         */
        eventHandlers?: { [type: string]: EventListenerOrEventListenerObject } | undefined;
        /**
         * Event listeners to be bound to the XMLHttpRequest upload object.
         * To bind events to the XMLHttpRequest object, use eventHandlers. The handler will be called in the context of a $apply block.
         */
        uploadEventHandlers?: { [type: string]: EventListenerOrEventListenerObject } | undefined;
    }

    interface IHttpHeadersGetter {
        (): { [name: string]: string };
        (headerName: string): string;
    }

    interface IHttpPromiseCallback<T> {
        (data: T, status: number, headers: IHttpHeadersGetter, config: IRequestConfig): void;
    }

    interface IHttpResponse<T> {
        data: T;
        status: number;
        headers: IHttpHeadersGetter;
        config: IRequestConfig;
        statusText: string;
        /** Added in AngularJS 1.6.6 */
        xhrStatus: "complete" | "error" | "timeout" | "abort";
    }

    /** @deprecated The old name of IHttpResponse. Kept for compatibility. */
    type IHttpPromiseCallbackArg<T> = IHttpResponse<T>;

    type IHttpPromise<T> = IPromise<IHttpResponse<T>>;

    // See the jsdoc for transformData() at https://github.com/angular/angular.js/blob/master/src/ng/http.js#L228
    interface IHttpRequestTransformer {
        (data: any, headersGetter: IHttpHeadersGetter): any;
    }

    // The definition of fields are the same as IHttpResponse
    interface IHttpResponseTransformer {
        (data: any, headersGetter: IHttpHeadersGetter, status: number): any;
    }

    interface HttpHeaderType {
        [requestType: string]: string | ((config: IRequestConfig) => string);
    }

    interface IHttpRequestConfigHeaders {
        [requestType: string]: any;
        common?: any;
        get?: any;
        post?: any;
        put?: any;
        patch?: any;
    }

    /**
     * Object that controls the defaults for $http provider. Not all fields of IRequestShortcutConfig can be configured
     * via defaults and the docs do not say which. The following is based on the inspection of the source code.
     * @see {@link https://docs.angularjs.org/api/ng/service/$http#defaults}
     * @see {@link https://docs.angularjs.org/api/ng/service/$http#usage}
     * @see {@link https://docs.angularjs.org/api/ng/provider/$httpProvider} The properties section
     */
    interface IHttpProviderDefaults {
        /**
         * {boolean|Cache}
         * If true, a default $http cache will be used to cache the GET request, otherwise if a cache instance built with $cacheFactory, this cache will be used for caching.
         */
        cache?: any;

        /**
         * Transform function or an array of such functions. The transform function takes the http request body and
         * headers and returns its transformed (typically serialized) version.
         * @see {@link https://docs.angularjs.org/api/ng/service/$http#transforming-requests-and-responses}
         */
        transformRequest?: IHttpRequestTransformer | IHttpRequestTransformer[] | undefined;

        /**
         * Transform function or an array of such functions. The transform function takes the http response body and
         * headers and returns its transformed (typically deserialized) version.
         */
        transformResponse?: IHttpResponseTransformer | IHttpResponseTransformer[] | undefined;

        /**
         * Map of strings or functions which return strings representing HTTP headers to send to the server. If the
         * return value of a function is null, the header will not be sent.
         * The key of the map is the request verb in lower case. The "common" key applies to all requests.
         * @see {@link https://docs.angularjs.org/api/ng/service/$http#setting-http-headers}
         */
        headers?: IHttpRequestConfigHeaders | undefined;

        /** Name of HTTP header to populate with the XSRF token. */
        xsrfHeaderName?: string | undefined;

        /** Name of cookie containing the XSRF token. */
        xsrfCookieName?: string | undefined;

        /**
         * whether to to set the withCredentials flag on the XHR object. See [requests with credentials]https://developer.mozilla.org/en/http_access_control#section_5 for more information.
         */
        withCredentials?: boolean | undefined;

        /**
         * A function used to the prepare string representation of request parameters (specified as an object). If
         * specified as string, it is interpreted as a function registered with the $injector. Defaults to
         * $httpParamSerializer.
         */
        paramSerializer?: string | ((obj: any) => string) | undefined;
    }

    interface IHttpInterceptor {
        request?(config: IRequestConfig): IRequestConfig | IPromise<IRequestConfig>;
        requestError?(rejection: any): IRequestConfig | IPromise<IRequestConfig>;
        response?<T>(response: IHttpResponse<T>): IPromise<IHttpResponse<T>> | IHttpResponse<T>;
        responseError?<T>(rejection: any): IPromise<IHttpResponse<T>> | IHttpResponse<T>;
    }

    interface IHttpInterceptorFactory {
        (...args: any[]): IHttpInterceptor;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$httpProvider} */
    interface IHttpProvider extends IServiceProvider {
        defaults: IHttpProviderDefaults;

        /**
         * Register service factories (names or implementations) for interceptors which are called before and after
         * each request.
         */
        interceptors: Array<string | Injectable<IHttpInterceptorFactory>>;
        useApplyAsync(): boolean;
        useApplyAsync(value: boolean): IHttpProvider;

        /** @deprecated The old name of xsrfTrustedOrigins. Kept for compatibility. */
        xsrfWhitelistedOrigins: string[];
        /**
         * Array containing URLs whose origins are trusted to receive the XSRF token.
         */
        xsrfTrustedOrigins: string[];
    }

    ///////////////////////////////////////////////////////////////////////////
    // HttpBackendService
    // @see {@link https://docs.angularjs.org/api/ng/service/$httpBackend}
    // You should never need to use this service directly.
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$httpBackend} */
    interface IHttpBackendService {
        // XXX Perhaps define callback signature in the future
        (
            method: string,
            url: string,
            post?: any,
            callback?: Function,
            headers?: any,
            timeout?: number,
            withCredentials?: boolean,
        ): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // InterpolateService
    // @see {@link https://docs.angularjs.org/api/ng/service/$interpolate}
    // @see {@link https://docs.angularjs.org/api/ng/provider/$interpolateProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$interpolate} */
    interface IInterpolateService {
        (
            text: string,
            mustHaveExpression?: boolean,
            trustedContext?: string,
            allOrNothing?: boolean,
        ): IInterpolationFunction;
        endSymbol(): string;
        startSymbol(): string;
    }

    interface IInterpolationFunction {
        (context: any): string;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$interpolateProvider} */
    interface IInterpolateProvider extends IServiceProvider {
        startSymbol(): string;
        startSymbol(value: string): IInterpolateProvider;
        endSymbol(): string;
        endSymbol(value: string): IInterpolateProvider;
    }

    ///////////////////////////////////////////////////////////////////////////
    // TemplateCacheService
    // @see {@link https://docs.angularjs.org/api/ng/service/$templateCache}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$templateCache} */
    interface ITemplateCacheService extends ICacheObject {}

    ///////////////////////////////////////////////////////////////////////////
    // SCEService
    // @see {@link https://docs.angularjs.org/api/ng/service/$sce}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$sce} */
    interface ISCEService {
        getTrusted(type: string, mayBeTrusted: any): any;
        getTrustedCss(value: any): any;
        getTrustedHtml(value: any): any;
        getTrustedJs(value: any): any;
        getTrustedResourceUrl(value: any): any;
        getTrustedUrl(value: any): any;
        parse(type: string, expression: string): (context: any, locals: any) => any;
        parseAsCss(expression: string): (context: any, locals: any) => any;
        parseAsHtml(expression: string): (context: any, locals: any) => any;
        parseAsJs(expression: string): (context: any, locals: any) => any;
        parseAsResourceUrl(expression: string): (context: any, locals: any) => any;
        parseAsUrl(expression: string): (context: any, locals: any) => any;
        trustAs(type: string, value: any): any;
        trustAsHtml(value: any): any;
        trustAsJs(value: any): any;
        trustAsResourceUrl(value: any): any;
        trustAsUrl(value: any): any;
        isEnabled(): boolean;
    }

    ///////////////////////////////////////////////////////////////////////////
    // SCEProvider
    // @see {@link https://docs.angularjs.org/api/ng/provider/$sceProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/provider/$sceProvider} */
    interface ISCEProvider extends IServiceProvider {
        enabled(value: boolean): void;
    }

    ///////////////////////////////////////////////////////////////////////////
    // SCEDelegateService
    // @see {@link https://docs.angularjs.org/api/ng/service/$sceDelegate}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/service/$sceDelegate} */
    interface ISCEDelegateService {
        getTrusted(type: string, mayBeTrusted: any): any;
        trustAs(type: string, value: any): any;
        valueOf(value: any): any;
    }

    ///////////////////////////////////////////////////////////////////////////
    // SCEDelegateProvider
    // @see {@link https://docs.angularjs.org/api/ng/provider/$sceDelegateProvider}
    ///////////////////////////////////////////////////////////////////////////
    /** @see {@link https://docs.angularjs.org/api/ng/provider/$sceDelegateProvider} */
    interface ISCEDelegateProvider extends IServiceProvider {
        /** @deprecated since 1.8.1 */
        resourceUrlBlacklist(): any[];
        /** @deprecated since 1.8.1 */
        resourceUrlBlacklist(bannedList: any[]): void;
        bannedResourceUrlList(): any[];
        bannedResourceUrlList(bannedList: any[]): void;
        /** @deprecated since 1.8.1 */
        resourceUrlWhitelist(): any[];
        /** @deprecated since 1.8.1 */
        resourceUrlWhitelist(trustedList: any[]): void;
        trustedResourceUrlList(): any[];
        trustedResourceUrlList(trustedList: any[]): void;
    }

    /**
     * $templateRequest service
     * @see {@link https://docs.angularjs.org/api/ng/service/$templateRequest}
     */
    interface ITemplateRequestService {
        /**
         * Downloads a template using $http and, upon success, stores the
         * contents inside of $templateCache.
         *
         * If the HTTP request fails or the response data of the HTTP request is
         * empty then a $compile error will be thrown (unless
         * {ignoreRequestError} is set to true).
         *
         * @param tpl                  The template URL.
         * @param ignoreRequestError   Whether or not to ignore the exception
         *                             when the request fails or the template is
         *                             empty.
         *
         * @return   A promise whose value is the template content.
         */
        (tpl: string, ignoreRequestError?: boolean): IPromise<string>;
        /**
         * total amount of pending template requests being downloaded.
         */
        totalPendingRequests: number;
    }

    ///////////////////////////////////////////////////////////////////////////
    // Component
    // see http://angularjs.blogspot.com.br/2015/11/angularjs-15-beta2-and-14-releases.html
    // and http://toddmotto.com/exploring-the-angular-1-5-component-method/
    ///////////////////////////////////////////////////////////////////////////
    /**
     * Component definition object (a simplified directive definition object)
     * @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#component}
     */
    interface IComponentOptions {
        /**
         * Controller constructor function that should be associated with newly created scope or the name of a registered
         * controller if passed as a string. Empty function by default.
         * Use the array form to define dependencies (necessary if strictDi is enabled and you require dependency injection)
         */
        controller?: string | Injectable<IControllerConstructor> | undefined;
        /**
         * An identifier name for a reference to the controller. If present, the controller will be published to its scope under
         * the specified name. If not present, this will default to '$ctrl'.
         */
        controllerAs?: string | undefined;
        /**
         * html template as a string or a function that returns an html template as a string which should be used as the
         * contents of this component. Empty string by default.
         * If template is a function, then it is injected with the following locals:
         * $element - Current element
         * $attrs - Current attributes object for the element
         * Use the array form to define dependencies (necessary if strictDi is enabled and you require dependency injection)
         */
        template?: string | Injectable<(...args: any[]) => string> | undefined;
        /**
         * Path or function that returns a path to an html template that should be used as the contents of this component.
         * If templateUrl is a function, then it is injected with the following locals:
         * $element - Current element
         * $attrs - Current attributes object for the element
         * Use the array form to define dependencies (necessary if strictDi is enabled and you require dependency injection)
         */
        templateUrl?: string | Injectable<(...args: any[]) => string> | undefined;
        /**
         * Define DOM attribute binding to component properties. Component properties are always bound to the component
         * controller and not to the scope.
         */
        bindings?: { [boundProperty: string]: string } | undefined;
        /**
         * Whether transclusion is enabled. Disabled by default.
         */
        transclude?: boolean | { [slot: string]: string } | undefined;
        /**
         * Requires the controllers of other directives and binds them to this component's controller.
         * The object keys specify the property names under which the required controllers (object values) will be bound.
         * Note that the required controllers will not be available during the instantiation of the controller,
         * but they are guaranteed to be available just before the $onInit method is executed!
         */
        require?: { [controller: string]: string } | undefined;
    }

    type IControllerConstructor =
        | (new(...args: any[]) => IController)
        | // Instead of classes, plain functions are often used as controller constructors, especially in examples.
        ((...args: any[]) => void | IController);

    /**
     * Directive controllers have a well-defined lifecycle. Each controller can implement "lifecycle hooks". These are methods that
     * will be called by Angular at certain points in the life cycle of the directive.
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     * @see {@link https://docs.angularjs.org/guide/component}
     */
    interface IController {
        /**
         * Called on each controller after all the controllers on an element have been constructed and had their bindings
         * initialized (and before the pre & post linking functions for the directives on this element). This is a good
         * place to put initialization code for your controller.
         */
        $onInit?(): void;
        /**
         * Called on each turn of the digest cycle. Provides an opportunity to detect and act on changes.
         * Any actions that you wish to take in response to the changes that you detect must be invoked from this hook;
         * implementing this has no effect on when \`$onChanges\` is called. For example, this hook could be useful if you wish
         * to perform a deep equality check, or to check a \`Dat\`e object, changes to which would not be detected by Angular's
         * change detector and thus not trigger \`$onChanges\`. This hook is invoked with no arguments; if detecting changes,
         * you must store the previous value(s) for comparison to the current values.
         */
        $doCheck?(): void;
        /**
         * Called whenever one-way bindings are updated. The onChangesObj is a hash whose keys are the names of the bound
         * properties that have changed, and the values are an {@link IChangesObject} object  of the form
         * { currentValue, previousValue, isFirstChange() }. Use this hook to trigger updates within a component such as
         * cloning the bound value to prevent accidental mutation of the outer value.
         */
        $onChanges?(onChangesObj: IOnChangesObject): void;
        /**
         * Called on a controller when its containing scope is destroyed. Use this hook for releasing external resources,
         * watches and event handlers.
         */
        $onDestroy?(): void;
        /**
         * Called after this controller's element and its children have been linked. Similar to the post-link function this
         * hook can be used to set up DOM event handlers and do direct DOM manipulation. Note that child elements that contain
         * templateUrl directives will not have been compiled and linked since they are waiting for their template to load
         * asynchronously and their own compilation and linking has been suspended until that occurs. This hook can be considered
         * analogous to the ngAfterViewInit and ngAfterContentInit hooks in Angular 2. Since the compilation process is rather
         * different in Angular 1 there is no direct mapping and care should be taken when upgrading.
         */
        $postLink?(): void;

        // IController implementations frequently do not implement any of its methods.
        // A string indexer indicates to TypeScript not to issue a weak type error in this case.
        [s: string]: any;
    }

    /**
     * Interface for the $onInit lifecycle hook
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     */
    interface IOnInit {
        /**
         * Called on each controller after all the controllers on an element have been constructed and had their bindings
         * initialized (and before the pre & post linking functions for the directives on this element). This is a good
         * place to put initialization code for your controller.
         */
        $onInit(): void;
    }

    /**
     * Interface for the $doCheck lifecycle hook
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     */
    interface IDoCheck {
        /**
         * Called on each turn of the digest cycle. Provides an opportunity to detect and act on changes.
         * Any actions that you wish to take in response to the changes that you detect must be invoked from this hook;
         * implementing this has no effect on when \`$onChanges\` is called. For example, this hook could be useful if you wish
         * to perform a deep equality check, or to check a \`Dat\`e object, changes to which would not be detected by Angular's
         * change detector and thus not trigger \`$onChanges\`. This hook is invoked with no arguments; if detecting changes,
         * you must store the previous value(s) for comparison to the current values.
         */
        $doCheck(): void;
    }

    /**
     * Interface for the $onChanges lifecycle hook
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     */
    interface IOnChanges {
        /**
         * Called whenever one-way bindings are updated. The onChangesObj is a hash whose keys are the names of the bound
         * properties that have changed, and the values are an {@link IChangesObject} object  of the form
         * { currentValue, previousValue, isFirstChange() }. Use this hook to trigger updates within a component such as
         * cloning the bound value to prevent accidental mutation of the outer value.
         */
        $onChanges(onChangesObj: IOnChangesObject): void;
    }

    /**
     * Interface for the $onDestroy lifecycle hook
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     */
    interface IOnDestroy {
        /**
         * Called on a controller when its containing scope is destroyed. Use this hook for releasing external resources,
         * watches and event handlers.
         */
        $onDestroy(): void;
    }

    /**
     * Interface for the $postLink lifecycle hook
     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#life-cycle-hooks}
     */
    interface IPostLink {
        /**
         * Called after this controller's element and its children have been linked. Similar to the post-link function this
         * hook can be used to set up DOM event handlers and do direct DOM manipulation. Note that child elements that contain
         * templateUrl directives will not have been compiled and linked since they are waiting for their template to load
         * asynchronously and their own compilation and linking has been suspended until that occurs. This hook can be considered
         * analogous to the ngAfterViewInit and ngAfterContentInit hooks in Angular 2. Since the compilation process is rather
         * different in Angular 1 there is no direct mapping and care should be taken when upgrading.
         */
        $postLink(): void;
    }

    interface IOnChangesObject {
        [property: string]: IChangesObject<any>;
    }

    interface IChangesObject<T> {
        currentValue: T;
        previousValue: T;
        isFirstChange(): boolean;
    }

    ///////////////////////////////////////////////////////////////////////////
    // Directive
    // @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#directive}
    // and {@link https://docs.angularjs.org/guide/directive}
    ///////////////////////////////////////////////////////////////////////////

    type IDirectiveController = IController | IController[] | { [key: string]: IController };

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#directive} */
    interface IDirectiveFactory<
        TScope extends IScope = IScope,
        TElement extends JQLite = JQLite,
        TAttributes extends IAttributes = IAttributes,
        TController extends IDirectiveController = IController,
    > {
        (
            ...args: any[]
        ):
            | IDirective<TScope, TElement, TAttributes, TController>
            | IDirectiveLinkFn<TScope, TElement, TAttributes, TController>;
    }

    interface IDirectiveLinkFn<
        TScope extends IScope = IScope,
        TElement extends JQLite = JQLite,
        TAttributes extends IAttributes = IAttributes,
        TController extends IDirectiveController = IController,
    > {
        (
            scope: TScope,
            instanceElement: TElement,
            instanceAttributes: TAttributes,
            controller?: TController,
            transclude?: ITranscludeFunction,
        ): void;
    }

    interface IDirectivePrePost<
        TScope extends IScope = IScope,
        TElement extends JQLite = JQLite,
        TAttributes extends IAttributes = IAttributes,
        TController extends IDirectiveController = IController,
    > {
        pre?: IDirectiveLinkFn<TScope, TElement, TAttributes, TController> | undefined;
        post?: IDirectiveLinkFn<TScope, TElement, TAttributes, TController> | undefined;
    }

    interface IDirectiveCompileFn<
        TScope extends IScope = IScope,
        TElement extends JQLite = JQLite,
        TAttributes extends IAttributes = IAttributes,
        TController extends IDirectiveController = IController,
    > {
        (
            templateElement: TElement,
            templateAttributes: TAttributes,
            /**
             * @deprecated
             * Note: The transclude function that is passed to the compile function is deprecated,
             * as it e.g. does not know about the right outer scope. Please use the transclude function
             * that is passed to the link function instead.
             */
            transclude: ITranscludeFunction,
        ):
            | void
            | IDirectiveLinkFn<TScope, TElement, TAttributes, TController>
            | IDirectivePrePost<TScope, TElement, TAttributes, TController>;
    }

    /** @see {@link https://docs.angularjs.org/api/ng/provider/$compileProvider#directive} */
    interface IDirective<
        TScope extends IScope = IScope,
        TElement extends JQLite = JQLite,
        TAttributes extends IAttributes = IAttributes,
        TController extends IDirectiveController = IController,
    > {
        compile?: IDirectiveCompileFn<TScope, TElement, TAttributes, TController> | undefined;
        controller?: string | Injectable<IControllerConstructor> | undefined;
        controllerAs?: string | undefined;
        /**
         * Deprecation warning: although bindings for non-ES6 class controllers are currently bound to this before
         * the controller constructor is called, this use is now deprecated. Please place initialization code that
         * relies upon bindings inside a $onInit method on the controller, instead.
         */
        bindToController?: boolean | { [boundProperty: string]: string } | undefined;
        link?:
            | IDirectiveLinkFn<TScope, TElement, TAttributes, TController>
            | IDirectivePrePost<TScope, TElement, TAttributes, TController>
            | undefined;
        multiElement?: boolean | undefined;
        priority?: number | undefined;
        /**
         * @deprecated
         */
        replace?: boolean | undefined;
        require?: string | string[] | { [controller: string]: string } | undefined;
        restrict?: string | undefined;
        scope?: boolean | { [boundProperty: string]: string } | undefined;
        template?: string | ((tElement: TElement, tAttrs: TAttributes) => string) | undefined;
        templateNamespace?: string | undefined;
        templateUrl?: string | ((tElement: TElement, tAttrs: TAttributes) => string) | undefined;
        terminal?: boolean | undefined;
        transclude?: boolean | "element" | { [slot: string]: string } | undefined;
    }

    /**
     * These interfaces are kept for compatibility with older versions of these type definitions.
     * Actually, Angular doesn't create a special subclass of jQuery objects. It extends jQuery.prototype
     * like jQuery plugins do, that's why all jQuery objects have these Angular-specific methods, not
     * only those returned from angular.element.
     * @see {@link https://docs.angularjs.org/api/angular.element}
     */
    interface IAugmentedJQueryStatic extends JQueryStatic {}
    interface IAugmentedJQuery extends JQLite {}

    /**
     * Same as IController. Keeping it for compatibility with older versions of these type definitions.
     */
    interface IComponentController extends IController {}

    ///////////////////////////////////////////////////////////////////////////
    // AUTO module (angular.js)
    ///////////////////////////////////////////////////////////////////////////
    namespace auto {
        ///////////////////////////////////////////////////////////////////////
        // InjectorService
        // @see {@link https://docs.angularjs.org/api/AUTO.$injector}
        ///////////////////////////////////////////////////////////////////////
        /** @see {@link https://docs.angularjs.org/api/auto/service/$injector} */
        interface IInjectorService {
            annotate(fn: Function, strictDi?: boolean): string[];
            annotate(inlineAnnotatedFunction: any[]): string[];
            get<T>(name: string, caller?: string): T;
            get(name: "$anchorScroll"): IAnchorScrollService;
            get(name: "$cacheFactory"): ICacheFactoryService;
            get(name: "$compile"): ICompileService;
            get(name: "$controller"): IControllerService;
            get(name: "$document"): IDocumentService;
            get(name: "$exceptionHandler"): IExceptionHandlerService;
            get(name: "$filter"): IFilterService;
            get(name: "$http"): IHttpService;
            get(name: "$httpBackend"): IHttpBackendService;
            get(name: "$httpParamSerializer"): IHttpParamSerializer;
            get(name: "$httpParamSerializerJQLike"): IHttpParamSerializer;
            get(name: "$interpolate"): IInterpolateService;
            get(name: "$interval"): IIntervalService;
            get(name: "$locale"): ILocaleService;
            get(name: "$location"): ILocationService;
            get(name: "$log"): ILogService;
            get(name: "$parse"): IParseService;
            get(name: "$q"): IQService;
            get(name: "$rootElement"): IRootElementService;
            get(name: "$rootScope"): IRootScopeService;
            get(name: "$sce"): ISCEService;
            get(name: "$sceDelegate"): ISCEDelegateService;
            get(name: "$templateCache"): ITemplateCacheService;
            get(name: "$templateRequest"): ITemplateRequestService;
            get(name: "$timeout"): ITimeoutService;
            get(name: "$window"): IWindowService;
            get<T>(name: "$xhrFactory"): IXhrFactory<T>;
            has(name: string): boolean;
            instantiate<T>(typeConstructor: { new(...args: any[]): T }, locals?: any): T;
            invoke<T = any>(func: Injectable<Function | ((...args: any[]) => T)>, context?: any, locals?: any): T;
            /**
             * Add the specified modules to the current injector.
             * This method will add each of the injectables to the injector and execute all of the config and run blocks for each module passed to the method.
             * @param modules A module, module name or annotated injection function.
             */
            loadNewModules(modules: Array<IModule | string | Injectable<(...args: any[]) => void>>): void;
            /** An object map of all the modules that have been loaded into the injector. */
            modules: { [moduleName: string]: IModule };
            strictDi: boolean;
        }

        ///////////////////////////////////////////////////////////////////////
        // ProvideService
        // @see {@link https://docs.angularjs.org/api/AUTO.$provide}
        ///////////////////////////////////////////////////////////////////////
        /** @see {@link https://docs.angularjs.org/api/auto/service/$provide} */
        interface IProvideService {
            // Documentation says it returns the registered instance, but actual
            // implementation does not return anything.
            // constant(name: string, value: any): any;
            /**
             * Register a constant service, such as a string, a number, an array, an object or a function, with the $injector. Unlike value it can be injected into a module configuration function (see config) and it cannot be overridden by an Angular decorator.
             *
             * @param name The name of the constant.
             * @param value The constant value.
             */
            constant(name: string, value: any): void;

            /**
             * Register a service decorator with the $injector. A service decorator intercepts the creation of a service, allowing it to override or modify the behaviour of the service. The object returned by the decorator may be the original service, or a new service object which replaces or wraps and delegates to the original service.
             *
             * @param name The name of the service to decorate.
             * @param decorator This function will be invoked when the service needs to be instantiated and should return the decorated service instance. The function is called using the injector.invoke method and is therefore fully injectable. Local injection arguments:
             *
             * $delegate - The original service instance, which can be monkey patched, configured, decorated or delegated to.
             */
            decorator(name: string, decorator: Function): void;
            /**
             * Register a service decorator with the $injector. A service decorator intercepts the creation of a service, allowing it to override or modify the behaviour of the service. The object returned by the decorator may be the original service, or a new service object which replaces or wraps and delegates to the original service.
             *
             * @param name The name of the service to decorate.
             * @param inlineAnnotatedFunction This function will be invoked when the service needs to be instantiated and should return the decorated service instance. The function is called using the injector.invoke method and is therefore fully injectable. Local injection arguments:
             *
             * $delegate - The original service instance, which can be monkey patched, configured, decorated or delegated to.
             */
            decorator(name: string, inlineAnnotatedFunction: any[]): void;
            factory(name: string, serviceFactoryFunction: Function): IServiceProvider;
            factory(name: string, inlineAnnotatedFunction: any[]): IServiceProvider;
            provider(name: string, provider: IServiceProvider): IServiceProvider;
            provider(name: string, serviceProviderConstructor: Function): IServiceProvider;
            service(name: string, constructor: Function): IServiceProvider;
            service(name: string, inlineAnnotatedFunction: any[]): IServiceProvider;
            value(name: string, value: any): IServiceProvider;
        }
    }

    /**
     * $http params serializer that converts objects to strings
     * @see {@link https://docs.angularjs.org/api/ng/service/$httpParamSerializer}
     */
    interface IHttpParamSerializer {
        (obj: Object): string;
    }

    interface IFilterFunction extends Function {
        /**
         * By default, filters are only run once the input value changes. By marking the filter as \`$stateful\`, the filter will be run on every \`$digest\` to update the output. **This is strongly discouraged.**
         * @see {@link https://docs.angularjs.org/guide/filter#stateful-filters}
         */
        $stateful?: boolean | undefined;
    }
    type FilterFactory = (...I: any[]) => IFilterFunction;
}


// Service Portal widget client controller injected variables,
// Available as parameters in: api.controller = function($scope, ...) {}
// -----------------------------------------------------------------------------
/** Current AngularJS scope for this widget. Use $scope.varName to share data with the template. */
declare var $scope: angular.IScope;
/** AngularJS HTTP service for XHR requests (GET, POST, PUT, DELETE, etc.). */
declare var $http: angular.IHttpService;
/** AngularJS promise / deferred service. Use $q.defer() to create a deferred task. */
declare var $q: angular.IQService;
/** Angular-aware wrapper for setTimeout. Keeps the digest cycle in sync. */
declare var $timeout: angular.ITimeoutService;
/** Angular-aware wrapper for setInterval. Keeps the digest cycle in sync. */
declare var $interval: angular.IIntervalService;
/** Service for reading and manipulating the current browser URL. */
declare var $location: angular.ILocationService;

/** Retrieves a registered AngularJS filter function by name. */
declare var $filter: angular.IFilterService;

/** Simple logging service wrapping the browser console. */
declare var $log: angular.ILogService;

/** Injectable reference to the browser window object. */
declare var $window: Window & typeof globalThis;

/** Injectable jqLite-wrapped reference to window.document. */
declare var $document: any;

/** jqLite-wrapped reference to the widget's root DOM element. Available in directive controllers and link functions. */
declare var $element: JQLite;

/** The root scope of the AngularJS application; parent of all other scopes. */
declare var $rootScope: angular.IRootScopeService;

/** Strict Contextual Escaping service for marking content as trusted. */
declare var $sce: angular.ISCEService;

/** CSS/JS animation service for animating DOM elements. Requires ngAnimate for full CSS/JS transitions. */
declare var $animate: angular.IAnimateService;
/** Scrolls the viewport to the element matching a hash. Monitors \`$location.hash()\` by default. */
declare var $anchorScroll: angular.IAnchorScrollService;
/** Factory that creates named in-memory caches with optional LRU eviction. */
declare var $cacheFactory: angular.ICacheFactoryService;
/** Compiles HTML or DOM into a template link function. */
declare var $compile: angular.ICompileService;
/** Instantiates AngularJS controllers by constructor or registered name. */
declare var $controller: angular.IControllerService;
/** Handles uncaught exceptions in AngularJS expressions. */
declare var $exceptionHandler: angular.IExceptionHandlerService;
/** Compiles a string with \`{{ }}\` markup into an interpolation function. */
declare var $interpolate: angular.IInterpolateService;
/** Converts an AngularJS expression string into a compiled evaluator function. */
declare var $parse: angular.IParseService;
/** In-memory cache for Angular templates. */
declare var $templateCache: angular.ITemplateCacheService;
/** Service Portal server-side data returned to the widget (populated by the server script). */
declare var data: { [key: string]: any };
/** Service Portal options object (widget instance options configured on the page). */
declare var options: { [key: string]: any };

/** Service Portal client utility service. */
declare var spUtil: SpUtil;
/** Service Portal modal dialog service. */
declare var spModal: SpModal;
type spUtil = SpUtil;
type spModal = SpModal;
type $uibModal = SpModal;
type snRecordWatcher = SnRecordWatcher;
type cabrillo = Cabrillo;
type i18n = I18n;
type spAriaUtil = SpAriaUtil;
type spNavServiceClient = SpNavServiceClient;
type $scope = angular.IScope;
type $http = angular.IHttpService;
type $q = angular.IQService;
type $timeout = angular.ITimeoutService;
type $location = angular.ILocationService;
type $rootScope = angular.IRootScopeService;
type $element = JQLite;
type $window = Window & typeof globalThis;
type $document = JQLite;

// 'api' isn't declared here since AngularJS injects by name, not position; monaco_plus_core builds a matching 'declare var api' from the parsed controller params (see MONACO_LANGUAGE_CLIENT_DI).

    /**
    * Compiles a string with \`{{ }}\` markup into an interpolation function.
    * @see {@link https://docs.angularjs.org/api/ng/service/$interpolate}
    * @example
    * var fn = $interpolate("Hello {{name}}!");
    * fn({ name: "World" }); // => "Hello World!"
    */
    declare var $interpolate: angular.IInterpolateService;
    
    /**
    * Converts an AngularJS expression string into a compiled evaluator function.
    * @see {@link https://docs.angularjs.org/api/ng/service/$parse}
    * @example
    * var getter = $parse("user.name");
    * getter($scope);              // reads  $scope.user.name
    * getter.assign($scope, "Bob"); // writes $scope.user.name = "Bob"
    */
    declare var $parse: angular.IParseService;
    
    /**
    * In-memory cache for Angular templates. Check here before issuing template XHRs.
    * @see {@link https://docs.angularjs.org/api/ng/service/$templateCache}
    * @example
    * $templateCache.put("card.html", "<div class=\\"card\\">{{title}}</div>");
    */
    declare var $templateCache: angular.ITemplateCacheService;
    
    /** Service Portal server-side data returned to the widget (populated by the server script). */
    declare var data: { [key: string]: any };
    
    /** Service Portal options object (widget instance options configured on the page). */
    declare var options: { [key: string]: any };
    
    // -----------------------------------------------------------------------------
    // ServiceNow Client-Side API Declarations
    // -----------------------------------------------------------------------------
    
    // ---- GlideForm — g_form -----------------------------------------------------
    
    /**
    * Client-side form manipulation API available as the global \`g_form\` in
    * standard ServiceNow form client scripts, UI policies, and in embedded forms
    * inside Service Portal widgets.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideFormAPI
    */
    declare class GlideForm {
    
        // -------------------------------------------------------------------------
        // Messages
        // -------------------------------------------------------------------------
    
        /**
         * Displays a red error-message banner at the top of the form.
         * @param message The message text (HTML is allowed).
         */
        addErrorMessage(message: string): void;
    
        /**
         * Displays a blue informational banner at the top of the form.
         * @param message The message text (HTML is allowed).
         */
        addInfoMessage(message: string): void;
    
        /** Removes all banner messages (both error and info) from the form. */
        clearMessages(): void;
    
        // -------------------------------------------------------------------------
        // Field decorations
        // -------------------------------------------------------------------------
    
        /**
         * Adds a decorative icon to the right of a field label.
         * @param fieldName The field name.
         * @param icon Bootstrap / ServiceNow icon name (e.g. \`"icon-star"\`).
         * @param title Tooltip text shown on hover.
         * @param color Optional CSS colour string.
         */
        addDecoration(fieldName: string, icon: string, title: string, color?: string): void;
    
        /**
         * Removes a decorative icon previously added with \`addDecoration()\`.
         * @param fieldName The field name.
         * @param icon The icon name that was added.
         * @param title The tooltip text that was added.
         */
        removeDecoration(fieldName: string, icon: string, title: string): void;
    
        /**
         * Briefly flashes the field's background colour to draw the user's attention.
         * @param fieldName The field name.
         * @param color CSS hex colour (e.g. \`"#FF0000"\`) or a named CSS colour.
         * @param count Number of times to flash.
         */
        flash(fieldName: string, color: string, count: number): void;
    
        // -------------------------------------------------------------------------
        // Choice lists
        // -------------------------------------------------------------------------
    
        /**
         * Appends a new option to a choice list field.
         * @param fieldName The choice list field name.
         * @param choiceValue The stored value for the option.
         * @param choiceLabel The label shown to the user.
         * @param choiceIndex Optional 0-based insertion index (appended at end if omitted).
         */
        addOption(fieldName: string, choiceValue: string, choiceLabel: string, choiceIndex?: number): void;
    
        /** Removes all options from a choice list field. */
        clearOptions(fieldName: string): void;
    
        /**
         * Removes a specific option from a choice list field.
         * @param fieldName The choice list field name.
         * @param choiceValue The stored value of the option to remove.
         */
        removeOption(fieldName: string, choiceValue: string): void;
    
        /**
         * Returns the \`<option>\` DOM element for the given choice value.
         * Returns \`null\` when the choice value is not present.
         * @param fieldName The choice list field name.
         * @param choiceValue The stored value of the option.
         */
        getOption(fieldName: string, choiceValue: string): HTMLOptionElement | null;
    
        // -------------------------------------------------------------------------
        // Field values
        // -------------------------------------------------------------------------
    
        /** Clears the value of the field without triggering onChange. */
        clearValue(fieldName: string): void;
    
        /**
         * Returns the field's value coerced to a boolean.
         * \`"true"\` / \`"1"\` → \`true\`; everything else → \`false\`.
         */
        getBooleanValue(fieldName: string): boolean;
    
        /**
         * Returns the field's value as a decimal string.
         */
        getDecimalValue(fieldName: string): string;
    
        /**
         * Returns the display value of a reference or choice field.
         * For plain string fields this is the same as \`getValue()\`.
         */
        getDisplayValue(fieldName: string): string;
    
        /**
         * Returns the current raw value of the field.
         * For reference fields this is the \`sys_id\`; for choice fields the stored value.
         */
        getValue(fieldName: string): string;
    
        /**
         * Returns the field's current value (alias for \`getValue()\`).
         */
        getFieldValue(fieldName: string): string;
    
        /**
         * Returns the field's value coerced to an integer.
         * Returns \`0\` if the value cannot be parsed.
         */
        getIntValue(fieldName: string): number;
    
        /**
         * Returns the HTML content of an HTML-type field.
         * @param fieldName The field name (must be of type HTML).
         * @param lineEndings Optional line-ending character(s) for normalisation.
         */
        getHTMLValue(fieldName: string, lineEndings?: string): string;
    
        /**
         * Sets the value of a field, optionally supplying a display value for
         * reference or choice fields. Triggers the field's onChange client script.
         * @param fieldName The field name.
         * @param value Raw value (e.g. a \`sys_id\` for reference fields).
         * @param displayValue Optional display value shown to the user.
         */
        setValue(fieldName: string, value: string, displayValue?: string): void;
    
        // -------------------------------------------------------------------------
        // Field metadata / DOM
        // -------------------------------------------------------------------------
    
        /**
         * Returns a descriptor object for the field containing \`type\`, \`label\`,
         * \`value\`, \`display_value\`, and other metadata.
         * @returns Field descriptor object, or \`null\` if the field does not exist.
         */
        getField(fieldName: string): { [key: string]: any } | null;
    
        /** Returns an array of all field names on the current form view. */
        getFieldNames(): string[];
    
        /**
         * Returns the translated label displayed to the user for the field.
         */
        getLabelOf(fieldName: string): string;
    
        /**
         * Overrides the label displayed to the user for a field.
         * @param fieldName The field name.
         * @param label The new label text.
         */
        setLabel(fieldName: string, label: string): void;
    
        /**
         * Returns the DOM input element that backs the specified field.
         * Prefer g_form methods over direct DOM manipulation wherever possible.
         * @returns HTMLElement, or \`null\` if the field is not visible.
         */
        getControl(fieldName: string): HTMLElement | null;
    
        /**
         * Returns a raw DOM element by its HTML \`id\` attribute.
         * @returns HTMLElement, or \`null\`.
         */
        getElement(id: string): HTMLElement | null;
    
        /**
         * Returns the GlideRecord for the referenced record in a reference field.
         * This is an **asynchronous** operation; the result is passed to \`callback\`.
         * @param fieldName The reference field name.
         * @param callback Function called with the resolved GlideRecord as its argument.
         */
        getReference(fieldName: string, callback: (gr: { [key: string]: any }) => void): void;
    
        // -------------------------------------------------------------------------
        // Form metadata
        // -------------------------------------------------------------------------
    
        /**
         * Returns the name of the submit action that was clicked.
         * Available inside \`onSubmit\` client scripts.
         * @returns Action name string (e.g. \`"sysverb_save"\`), or empty string.
         */
        getActionName(): string;
    
        /** Returns the current form URL-encoded query string (\`sysparm_query\`). */
        getEncodedQuery(): string;
    
        /** Returns the \`<form>\` DOM element for the current record. */
        getForm(): HTMLElement;
    
        /** Returns an array of section names visible on the current form view. */
        getSectionNames(): string[];
    
        /** Returns an array of section DOM element objects. */
        getSections(): HTMLElement[];
    
        /** Returns the table name for the current record (e.g. \`"incident"\`). */
        getTableName(): string;
    
        // -------------------------------------------------------------------------
        // Field state
        // -------------------------------------------------------------------------
    
        /** Disables every editable field on the form. */
        disableAllFields(): void;
    
        /**
         * Disables or enables a single field.
         * A disabled field retains its value but cannot be edited.
         * @param disable \`true\` to disable; \`false\` to enable.
         */
        setDisabled(fieldName: string, disable: boolean): void;
    
        /**
         * Shows or hides a field without affecting its value or mandatory state.
         * @param displayBool \`true\` to show; \`false\` to hide.
         */
        setDisplay(fieldName: string, displayBool: boolean): void;
    
        /**
         * Returns \`true\` if the field is currently visible on the form.
         */
        isVisible(fieldName: string): boolean;
    
        /**
         * Sets or clears the read-only state of a field.
         * @param readOnly \`true\` for read-only; \`false\` for editable.
         */
        setReadOnly(fieldName: string, readOnly: boolean): void;
    
        /**
         * Returns \`true\` if the field is currently read-only.
         */
        isReadOnly(fieldName: string): boolean;
    
        /**
         * Sets or clears the mandatory constraint on a field.
         * @param mandatory \`true\` to make mandatory; \`false\` to make optional.
         */
        setMandatory(fieldName: string, mandatory: boolean): void;
    
        /**
         * Returns \`true\` if the specified field is currently mandatory.
         */
        isMandatory(fieldName: string): boolean;
    
        /**
         * Shows or hides an entire form section.
         * @param sectionName Section name as returned by \`getSectionNames()\`.
         * @param display \`true\` to show; \`false\` to hide.
         */
        setSectionDisplay(sectionName: string, display: boolean): void;
    
        // -------------------------------------------------------------------------
        // Field messages
        // -------------------------------------------------------------------------
    
        /**
         * Hides all inline field messages of the specified type.
         * @param type \`"error"\`, \`"info"\`, or omit for all types.
         */
        hideAllFieldMsgs(type?: 'error' | 'info'): void;
    
        /**
         * Removes the error box from the specified field.
         */
        hideErrorBox(fieldName: string): void;
    
        /**
         * Hides the inline message displayed below the specified field.
         * @param scrollForm If \`true\`, scrolls the page so the field is in view.
         */
        hideFieldMsg(fieldName: string, scrollForm?: boolean): void;
    
        /**
         * Displays a red error box directly below the field.
         * @param message The error message text.
         * @param scrollForm If \`true\`, scrolls the page so the field is in view.
         */
        showErrorBox(fieldName: string, message: string, scrollForm?: boolean): void;
    
        /**
         * Shows a coloured inline message below a field.
         * @param type \`"error"\` (red) or \`"info"\` (blue).
         * @param scrollForm If \`true\`, scrolls the page so the field is in view.
         */
        showFieldMsg(fieldName: string, message: string, type: 'error' | 'info', scrollForm?: boolean): void;
    
        // -------------------------------------------------------------------------
        // Related lists
        // -------------------------------------------------------------------------
    
        /** Hides the related list for the specified table. */
        hideRelatedList(listTableName: string): void;
    
        /** Hides all related lists at the bottom of the form. */
        hideRelatedLists(): void;
    
        /** Makes a previously hidden related list visible. */
        showRelatedList(listTableName: string): void;
    
        /** Makes all related lists visible. */
        showRelatedLists(): void;
    
        // -------------------------------------------------------------------------
        // Validation / state checks
        // -------------------------------------------------------------------------
    
        /**
         * Returns \`true\` if the user has made any unsaved changes to the form.
         */
        isChangesMade(): boolean;
    
        /**
         * Returns \`true\` when the form is displaying a new (unsaved) record.
         */
        isNewRecord(): boolean;
    
        /**
         * Validates all mandatory fields; returns \`false\` if any are empty.
         * Does **not** submit the form.
         */
        isValid(): boolean;
    
        // -------------------------------------------------------------------------
        // Save / submit
        // -------------------------------------------------------------------------
    
        /**
         * Saves the record and keeps the form open.
         * Equivalent to clicking the "Save" UI action.
         */
        save(): void;
    
        /**
         * Immediately saves the record without navigating away.
         */
        saveNow(): void;
    
        /**
         * Serialises the form to a URL-encoded query string of field name/value pairs.
         * @param onlyDirty If \`true\`, only fields with unsaved changes are included.
         * @returns URL-encoded string.
         */
        serialize(onlyDirty?: boolean): string;
    
        /**
         * Submits the form using the specified UI action verb.
         * @param verb Action name (e.g. \`"sysverb_save"\`, \`"sysverb_insert"\`,
         *             \`"sysverb_cancel"\`). Defaults to the standard Save action.
         */
        submit(verb?: string): void;
    }
    
    /**
    * Form manipulation API for the current record.
    * Available in client scripts and UI policies on standard ServiceNow forms,
    * and in embedded forms inside Service Portal widgets.
    */
    declare var g_form: GlideForm;
    
    // ---- GlideUser — g_user -----------------------------------------------------
    
    /**
    * Read-only proxy for the currently logged-in user's properties.
    *
    * Available as the global \`g_user\` in client scripts, UI policies, and
    * Service Portal widget client controllers.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideUserAPI
    */
    declare var g_user: {
        /** The user's first name (\`sys_user.first_name\`). */
        firstName: string;
        /** The user's last name (\`sys_user.last_name\`). */
        lastName: string;
        /** The \`sys_id\` of the current user's \`sys_user\` record. */
        userID: string;
        /** The user's login name (\`sys_user.user_name\`). */
        userName: string;
        /**
         * Key-value pairs pushed from the server via \`gs.putClientData(key, value)\`.
         * Populated at session initialisation; read-only on the client.
         */
        clientData: { [key: string]: string };
    
        /**
         * Returns a named value set server-side with \`gs.putClientData(key, value)\`.
         * @param key The data key.
         * @returns The value string, or \`null\` if the key was not set.
         */
        getClientData(key: string): string | null;
    
        /** Returns the user's first name. Equivalent to reading \`g_user.firstName\`. */
        getFirstName(): string;
    
        /** Returns the user's full name (first + space + last). */
        getFullName(): string;
    
        /** Returns the user's last name. Equivalent to reading \`g_user.lastName\`. */
        getLastName(): string;
    
        /**
         * Returns the value of the named user preference from \`sys_user_preference\`.
         * @param name Preference name (e.g. \`"rowcount"\`, \`"date_format"\`).
         * @returns The preference value, or \`null\` if not set.
         */
        getPreference(name: string): string | null;
    
        /** Returns the \`sys_id\` of the current user. Equivalent to \`g_user.userID\`. */
        getUserID(): string;
    
        /** Returns the login name of the current user. Equivalent to \`g_user.userName\`. */
        getUserName(): string;
    
        /**
         * Returns \`true\` if the current user has the named role (directly or via group).
         * @param role Role name (e.g. \`"itil"\`, \`"admin"\`).
         */
        hasRole(role: string): boolean;
    
        /**
         * Returns \`true\` only when the role is **directly** assigned to the user
         * (not inherited through group membership).
         * @param role Role name.
         */
        hasRoleExactly(role: string): boolean;
    
        /**
         * Returns \`true\` if the user has **any** of the comma-separated roles.
         * @param roles Comma-separated role names (e.g. \`"itil,admin"\`).
         */
        hasRoleFromList(roles: string): boolean;
    
        /**
         * Returns \`true\` if the current user has been assigned at least one role.
         */
        hasRoles(): boolean;
    };
    
    // ---- GlideList2 — g_list ----------------------------------------------------
    
    /**
    * Client-side API for interacting with embedded related lists on a form.
    * Obtain an instance with the static \`GlideList2.get()\` method.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideList2API
    */
    declare class GlideList2 {
    
        /**
         * Returns the GlideList2 instance for the specified list name.
         * @param listName The list element's DOM name attribute.
         * @returns The GlideList2 instance, or \`null\` if not found.
         */
        static get(listName: string): GlideList2 | null;
    
        /**
         * Returns a comma-separated string of the \`sys_id\` values for all currently
         * checked rows in the list.
         */
        getChecked(): string;
    
        /**
         * Returns \`true\` if the list filter is fixed and cannot be changed by the user.
         */
        getFixed(): boolean;
    
        /**
         * Returns an array of \`sys_id\` strings for all rows currently displayed.
         */
        getItems(): string[];
    
        /** Returns the internal name of this list (matches the DOM name attribute). */
        getName(): string;
    
        /**
         * Returns the active filter query for this list.
         * @param addDotQuery If \`true\`, prefixes the query with \`^\` (dot-walk notation).
         */
        getQuery(addDotQuery?: boolean): string;
    
        /** Returns the relationship name for a related list, or empty for direct lists. */
        getRelated(): string;
    
        /** Returns the table name that this list is displaying. */
        getTableName(): string;
    
        /** Returns the display title of the list section header. */
        getTitle(): string;
    
        /**
         * Returns the URL from which the list was loaded, including filter parameters.
         * @param addDotQuery If \`true\`, uses dot-walk query notation.
         */
        getURL(addDotQuery?: boolean): string;
    
        /**
         * Returns \`true\` if this is a multi-table relationship list.
         */
        isMultiList(): boolean;
    
        /**
         * Reloads the list from the server.
         * @param firstRow 1-based index of the first row to show after reload.
         * @param additionalParms Additional URL parameters to append to the request.
         */
        refresh(firstRow?: number, additionalParms?: string): void;
    
        /**
         * Removes the row with the specified \`sys_id\` from the list display.
         * Does **not** delete the record from the database.
         * @param sysId The \`sys_id\` of the row to remove.
         */
        removeItem(sysId: string): void;
    
        /**
         * Replaces the list's active filter and refreshes the list.
         * @param encodedQuery New encoded query (e.g. \`"active=true^priority=1"\`).
         */
        setQuery(encodedQuery: string): void;
    }
    
    /** Alias for the first list on the current form. */
    declare var g_list: GlideList2;
    
    // ---- GlideAjax --------------------------------------------------------------
    
    /**
    * Asynchronous AJAX client for calling server-side Script Include methods
    * from a client script or widget controller.
    *
    * The Script Include class **must** extend \`AbstractAjaxProcessor\`.
    *
    * @example
    * var ga = new GlideAjax('MyScriptInclude');
    * ga.addParam('sysparm_name', 'getItemCount');
    * ga.addParam('sysparm_query', 'active=true');
    * ga.getXML(function(response) {
    *     var answer = response.responseXML.documentElement.getAttribute('answer');
    *     console.log('Count:', answer);
    * });
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideAjaxAPI
    */
    declare class GlideAjax {
    
        /**
         * Creates a new GlideAjax client targeting the named Script Include.
         * @param scriptIncludeName Exact name of the Script Include class.
         */
        constructor(scriptIncludeName: string);
    
        /**
         * Adds a URL parameter sent to the Script Include on the server.
         * \`sysparm_name\` is **required** and must match the method name to call.
         * @param name Parameter name.
         * @param value Parameter value.
         */
        addParam(name: string, value: string): void;
    
        /**
         * Returns the current value of a previously set parameter.
         * @param name The parameter name.
         * @returns The value, or \`null\` if the parameter has not been set.
         */
        getParam(name: string): string | null;
    
        /**
         * Sends the AJAX request asynchronously and invokes \`callback\` on completion.
         *
         * Read the Script Include's return value with:
         * \`response.responseXML.documentElement.getAttribute('answer')\`
         *
         * @param callback Function called with the completed \`XMLHttpRequest\` object.
         */
        getXML(callback: (response: XMLHttpRequest) => void): void;
    
        /**
         * Sends the request **synchronously**, blocking the browser until complete.
         * @deprecated Use \`getXML()\` with a callback instead to avoid freezing the UI.
         */
        getXMLWait(): void;
    }
    
    // ---- GlideDialogWindow ------------------------------------------------------
    
    /**
    * Opens a ServiceNow record, UI page, or arbitrary URL inside a modal dialog.
    *
    * @example
    * var dialog = new GlideDialogWindow('my_ui_page');
    * dialog.setPreference('sysparm_query', 'active=true');
    * dialog.setTitle('Select a user');
    * dialog.render();
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideDialogWindowAPI
    */
    declare class GlideDialogWindow {
    
        /**
         * Creates a dialog window.
         * @param id UI Page name, URL, or record \`sys_id\` to render inside the dialog.
         * @param readOnly If \`true\`, opens the content in read-only mode.
         * @param width Dialog width in pixels.
         * @param height Dialog height in pixels.
         */
        constructor(id: string, readOnly?: boolean, width?: number, height?: number);
    
        /** Closes the dialog and removes it from the DOM. */
        destroy(): void;
    
        /**
         * Returns the native GlideDialog object (internal API — use with care).
         */
        getGlideDialog(): any;
    
        /**
         * Returns a preference value set with \`setPreference()\`.
         * @param name Preference key.
         */
        getPreference(name: string): string;
    
        /** Returns the dialog's current title bar text. */
        getTitle(): string;
    
        /** Builds the dialog DOM and makes it visible. */
        render(): void;
    
        /**
         * Sets a URL parameter passed to the page rendered inside the dialog.
         * @param name Parameter name.
         * @param value Parameter value.
         */
        setPreference(name: string, value: string): void;
    
        /**
         * Resizes the dialog.
         * @param width New width in pixels.
         * @param height New height in pixels.
         */
        setSize(width: number, height: number): void;
    
        /**
         * Sets the text shown in the dialog's title bar.
         * @param title New title text.
         */
        setTitle(title: string): void;
    }
    
    // ---- GlideURL ---------------------------------------------------------------
    
    /**
    * Builds well-formed ServiceNow URLs programmatically.
    * All parameter values are URL-encoded automatically.
    *
    * @example
    * var url = new GlideURL('incident.do');
    * url.addParam('sys_id', gr.sys_id.toString());
    * url.addParam('sysparm_view', 'mobile');
    * window.location.href = url.getURL();
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideURLClientAPI
    */
    declare class GlideURL {
    
        /**
         * Creates a GlideURL anchored to \`base\`.
         * @param base The path portion of the URL (e.g. \`"incident.do"\`, \`"$sp.do"\`).
         */
        constructor(base: string);
    
        /**
         * Appends a query parameter, URL-encoding the value.
         * Returns \`this\` for chaining.
         * @param name Parameter name.
         * @param value Parameter value (will be URL-encoded).
         */
        addParam(name: string, value: string): GlideURL;
    
        /**
         * Returns the full constructed URL string (path + \`?\` + encoded params).
         * @param extra Optional additional query string appended after all params.
         */
        get(extra?: string): string;
    
        /**
         * Returns only the encoded query string (without the leading \`?\`).
         */
        getParamString(): string;
    
        /**
         * Alias for \`get()\`.
         * @param extra Optional additional query string.
         */
        getURL(extra?: string): string;
    
        /**
         * Sets (or overwrites) a parameter value.
         * Returns \`this\` for chaining.
         * @param name Parameter name.
         * @param value Parameter value.
         */
        set(name: string, value: string): GlideURL;
    }
    
    // ---- GlideNavigation --------------------------------------------------------
    
    /**
    * Programmatic navigation helper for the ServiceNow platform UI.
    * Available as \`g_navigation\` in client scripts.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_GlideNavigationAPI
    */
    declare var g_navigation: {
    
        /** Returns the full URL of the current page. */
        getCurrentUrl(): string;
    
        /**
         * Navigates the main content frame to the specified URL.
         * @param url Target URL (relative or absolute).
         */
        navigate(url: string): void;
    
        /**
         * Opens the URL in the current window (\`window.location.href = url\`).
         * @param url Target URL.
         */
        open(url: string): void;
    
        /**
         * Opens a popup window.
         * @param url URL to open in the popup.
         * @param name Window name for \`window.open()\`.
         * @param features Window feature string (e.g. \`"width=800,height=600,resizable=yes"\`).
         * @param callback Optional function called with the opened window reference.
         * @returns The opened window object.
         */
        openPopup(url: string, name: string, features: string, callback?: (w: Window) => void): Window;
    };
    
    // ---- spUtil — Service Portal Client-Side Utility ----------------------------
    
    /**
    * Service Portal client-side utility service.
    *
    * Inject into widget controllers as a dependency named \`spUtil\`, or access
    * via the AngularJS injector.
    *
    * @example
    * api.controller = function($scope, spUtil) {
    *     spUtil.addInfoMessage('Hello from the client controller!');
    *
    *     spUtil.update($scope).then(function() {
    *         // data is now refreshed from the server
    *     });
    * };
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/rome/client/c_SPUtilAPI
    */
    interface SpUtil {
        /**
         * Displays a dismissible red error banner at the top of the portal page.
         * @param message Message text (HTML allowed).
         */
        addErrorMessage(message: string): void;
    
        /**
         * Displays a dismissible blue informational banner at the top of the portal page.
         * @param message Message text (HTML allowed).
         */
        addInfoMessage(message: string): void;
    
        /**
         * Interpolates a template string by replacing \`\u0024{key}\` placeholders with
         * values from the supplied object.
         *
         * @param template A string containing \`\u0024{key}\` tokens.
         * @param values Key-value pairs used for substitution.
         * @returns The interpolated string.
         *
         * @example
         * var msg = spUtil.format('Hello \u0024{name}, you have \u0024{count} items.', {
         *     name: g_user.getFullName(),
         *     count: data.items.length
         * });
         */
        format(template: string, values: { [key: string]: string }): string;
    
        /**
         * Fetches the data object for a widget without re-rendering it.
         * @param widgetId \`widget_id\` slug or \`sys_id\` of the target widget.
         * @param data Optional request data passed to the widget server script as \`input\`.
         * @returns Promise resolving with the widget's data object.
         */
        get(widgetId: string, data?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    
        /**
         * Returns \`true\` if the current portal page is marked as cacheable.
         */
        isCacheable(): boolean;
    
        /**
         * Returns \`true\` if the current portal is configured as a global search portal.
         */
        isGlobalSearch(): boolean;
    
        /**
         * Re-fetches the widget's server-side data and merges it back into the scope.
         * The widget template is **not** re-rendered — the DOM is preserved.
         *
         * @param widgetScope The \`$scope\` of the widget to refresh.
         * @param data Optional data sent to the server script as \`input\`.
         * @returns Promise resolving when the refresh is complete.
         */
        refresh(widgetScope: angular.IScope, data?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    
        /**
         * Sends data to the widget's server script and updates the widget's \`data\` object.
         * The widget template is **not** re-rendered — the DOM is preserved.
         *
         * @param widgetScope The \`$scope\` of the widget to update.
         * @param data Data sent to the server script as \`input\`.
         * @returns Promise resolving with the updated data object.
         */
        update(widgetScope: angular.IScope, data?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    }
    declare var spUtil: SpUtil;
    
    // -----------------------------------------------------------------------------
    // spModal — Service Portal Modal API
    // -----------------------------------------------------------------------------
    
    /** Options for \`spModal.open()\`. */
    interface SpModalOptions {
        /** Title shown in the modal header. */
        title?: string;
        /** Widget sys_id or widget_id to render inside the modal. */
        widget?: string;
        /** Options object passed to the embedded widget. */
        widgetInput?: { [key: string]: any };
        /** Shared scope properties available to the modal controller. */
        shared?: { [key: string]: any };
        /** Array of button objects with \`{ label, primary }\`. */
        buttons?: Array<{ label: string; primary?: boolean; value?: any }>;
        /** If false the backdrop click does not close the modal. */
        backdrop?: boolean | string;
        /** Bootstrap size: \`"sm"\`, \`"lg"\`, or omit for default. */
        size?: string;
        /** URL of an Angular template used as the modal body. */
        templateUrl?: string;
        /** Inline Angular template string for the modal body. */
        template?: string;
        /** Angular controller function or name for the modal. */
        controller?: string | Function;
    }
    
    /**
    * Service Portal modal service.
    *
    * Available as \`spModal\` in Service Portal widget client controllers.
    * Provides \`alert\`, \`confirm\`, \`prompt\`, and \`open\` helpers.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/sp-modal-api
    */
    interface SpModal {
    
        /**
         * Opens a modal dialog with the given options.
         * @param options Configuration for the modal.
         * @returns A promise that resolves with the button value clicked, or rejects on dismiss.
         */
        open(options: SpModalOptions): angular.IPromise<any>;
    
        /**
         * Shows a simple alert dialog with an OK button.
         * @param message The message text to display.
         * @param options Optional additional modal options.
         * @returns A promise that resolves when the user clicks OK.
         */
        alert(message: string, options?: SpModalOptions): angular.IPromise<void>;
    
        /**
         * Shows a confirmation dialog with OK and Cancel buttons.
         * @param message The confirmation question text.
         * @param options Optional additional modal options.
         * @returns A promise resolving \`true\` (OK) or \`false\` (Cancel).
         */
        confirm(message: string, options?: SpModalOptions): angular.IPromise<boolean>;
    
        /**
         * Shows an input prompt dialog.
         * @param message The prompt label text.
         * @param defaultValue Initial value shown in the input field.
         * @param options Optional additional modal options.
         * @returns A promise that resolves with the entered string, or rejects if cancelled.
         */
        prompt(message: string, defaultValue?: string, options?: SpModalOptions): angular.IPromise<string>;
    }
    declare var spModal: SpModal;

    interface SnRecordWatcher {
        /** Initializes a record watcher channel on a table with an optional query filter. */
        initChannel(scope: angular.IScope, tableName: string, filter?: string, actionCallback?: Function): void;
        /** Subscribes to record watcher events for a table. */
        watch(scope: angular.IScope, tableName: string, filter?: string): void;
        /** Registers a callback for record change events on a table. */
        initList(tableName: string, filter?: string): void;
        /** Returns true if Record Watcher is supported in the current browser/portal environment. */
        isSupported(): boolean;
    }
    declare var snRecordWatcher: SnRecordWatcher;

    interface Cabrillo {
        /** Returns true if running inside the native mobile container app. */
        isNative(): boolean;
        viewLayout: {
            setTitle(title: string): void;
            setSubtitle(subtitle: string): void;
            setNavigationBarButtons(buttons: any[], position?: string): void;
        };
        camera: {
            getPhoto(options?: any): angular.IPromise<any>;
        };
        attachments: {
            addFile(options?: any): angular.IPromise<any>;
        };
        modal: {
            dismiss(result?: any): void;
        };
    }
    declare var cabrillo: Cabrillo;

    interface I18n {
        /** Asynchronously gets translated string for a key or array of keys. */
        getMessage(message: string | string[], callback?: (translated: any) => void): angular.IPromise<any>;
        /** Synchronously formats a template string replacing {0}, {1} placeholders. */
        format(template: string, values: any[] | { [key: string]: any }): string;
        /** Returns cached translation for a key, or key itself if uncached. */
        get(message: string): string;
    }
    declare var i18n: I18n;

    interface SpAriaUtil {
        /**
         * Announces a message via an ARIA live region so screen readers read it aloud.
         * @param message Text to announce.
         * @param assertive If \`true\`, uses \`aria-live="assertive"\` (default is \`"polite"\`).
         */
        sendLiveMessage(message: string, assertive?: boolean): void;
    }
    declare var spAriaUtil: SpAriaUtil;

    interface SpNavServiceClient {
        open(url: string, target?: string): void;
        navigate(url: string): void;
    }
    declare var spNavServiceClient: SpNavServiceClient;

    declare var $uibModal: SpModal;
    
    // -----------------------------------------------------------------------------
    // GlideFlow — Client-Side Flow Execution
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for triggering Flow Designer flows, subflows, and actions.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideFlowClientSideAPI
    */
    declare var GlideFlow: {
    
        /**
         * Starts a Flow Designer flow.
         * @param flowName Fully-qualified flow API name (e.g. \`"global/my_flow"\`).
         * @param inputs Input variable values matching the flow's schema.
         * @param options Optional execution options.
         * @returns Promise resolving with execution context details.
         */
        startFlow(flowName: string, inputs?: { [key: string]: any }, options?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    
        /**
         * Starts a Flow Designer subflow.
         * @param subflowName Fully-qualified subflow API name.
         * @param inputs Input variable values.
         * @param options Optional execution options.
         * @returns Promise resolving with execution context details.
         */
        startSubflow(subflowName: string, inputs?: { [key: string]: any }, options?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    
        /**
         * Executes a standalone Flow Designer action.
         * @param actionName Fully-qualified action API name.
         * @param inputs Input values for the action.
         * @returns Promise resolving with the action's output object.
         */
        executeAction(actionName: string, inputs?: { [key: string]: any }): angular.IPromise<{ [key: string]: any }>;
    };
    
    // -----------------------------------------------------------------------------
    // GlideDocument — Client-Side DOM Utility
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side document utility for finding form and page elements.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideDocumentClientSideAPI
    */
    declare class GlideDocument {
    
        /**
         * Finds a DOM element by its \`id\` attribute.
         * @param id The element's id value.
         * @returns The element, or \`null\` if not found.
         */
        getElement(id: string): HTMLElement | null;
    
        /**
         * Returns all elements with the given CSS class.
         * @param className CSS class name.
         */
        getElementsByClassName(className: string): HTMLCollectionOf<Element>;
    
        /**
         * Returns the first element matching a CSS selector.
         * @param selector CSS selector string.
         */
        getBySelector(selector: string): Element | null;
    }
    
    // -----------------------------------------------------------------------------
    // GlideGuid — Client-Side GUID Generator
    // -----------------------------------------------------------------------------
    
    /**
    * Generates globally unique identifier strings.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideGuidClientSideAPI
    */
    declare class GlideGuid {
    
        /**
         * Generates a new 32-character GUID.
         * @returns A new GUID string (e.g. \`"9d4bf2571b294c10a5eb46568b86eac8"\`).
         */
        static generate(): string;
    }
    
    // -----------------------------------------------------------------------------
    // GlideModal — Legacy UI16 Modal Dialog
    // -----------------------------------------------------------------------------
    
    /**
    * Legacy modal dialog class. For Service Portal prefer \`spModal\`.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideModalClientSideAPI
    */
    declare class GlideModal {
    
        /**
         * Creates a GlideModal pointing at a UI Page or UI Macro.
         * @param id The \`sys_id\` or name of the target UI page/macro.
         * @param readOnly Display the target in read-only mode.
         * @param width Width of the modal in pixels.
         */
        constructor(id: string, readOnly?: boolean, width?: number);
    
        /** Sets the modal title. */
        setTitle(title: string): void;
    
        /** Sets the modal width in pixels. */
        setWidth(width: number): void;
    
        /**
         * Sets a named preference passed to the target UI page
         * (accessible via \`RP.getWindowProperties()\` inside the page).
         */
        setPreference(name: string, value: string): void;
    
        /** Returns a previously set preference value. */
        getPreference(name: string): string;
    
        /** Renders and displays the modal. */
        render(): void;
    
        /** Renders the modal using the supplied HTML instead of loading a UI page. */
        renderWithContent(content: string): void;
    
        /** Returns the inner iframe's content Window. */
        getContent(): Window | null;
    
        /** Removes the modal from the DOM. */
        destroy(): void;
    
        /** Sets the modal body to the given HTML string. */
        setBody(bodyHTML: string): void;
    
        /** Registers a lifecycle event handler (e.g. \`"before_render"\`, \`"after_render"\`). */
        on(event: string, handler: Function): void;
    
        /** Removes a lifecycle event handler. */
        off(event: string, handler?: Function): void;
    }
    
    // -----------------------------------------------------------------------------
    // GlideModalForm — Legacy Modal Form
    // -----------------------------------------------------------------------------
    
    /**
    * Opens a ServiceNow record form in a modal dialog.
    * For Service Portal prefer \`spModal\`.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideModalFormClientSideAPI
    */
    declare class GlideModalForm {
    
        /**
         * Creates a modal form for a table.
         * @param title Modal header title.
         * @param tableName Table whose form is displayed.
         * @param onSubmit Callback fired on form submit.
         * @param onLoadComplete Callback fired after the form loads.
         */
        constructor(title: string, tableName: string, onSubmit?: Function, onLoadComplete?: Function);
    
        /** Sets the modal title. */
        setTitle(title: string): void;
    
        /** Makes all fields read-only. */
        setReadOnly(readOnly: boolean): void;
    
        /** Changes the table name. */
        setTableName(tableName: string): void;
    
        /** Loads an existing record by sys_id. */
        setSysID(sysId: string): void;
    
        /** Sets an encoded query applied when creating a new record. */
        setQuery(encodedQuery: string): void;
    
        /** Registers a submit callback. */
        setOnSubmit(onSubmit: Function): void;
    
        /** Registers a load-complete callback. */
        setOnLoadComplete(onLoadComplete: Function): void;
    
        /** Passes a key/value preference to the form. */
        addParm(name: string, value: string): void;
    
        /** Opens and renders the modal form. */
        render(): void;
    
        /** Returns the underlying GlideModal instance. */
        getModal(): GlideModal;
    }
    
    // -----------------------------------------------------------------------------
    // GlideNotification — Client-Side Notification
    // -----------------------------------------------------------------------------
    
    /**
    * Displays toast-style notifications in the ServiceNow UI.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideNotificationClientAPI
    */
    declare class GlideNotification {
    
        /**
         * @param title Optional notification title.
         * @param description Notification body text.
         */
        constructor(title?: string, description?: string);
    
        /** Sets the notification title. */
        setTitle(title: string): void;
    
        /** Sets the body text. */
        setDescription(description: string): void;
    
        /** Sets the visual type: \`"success"\`, \`"info"\`, \`"warning"\`, or \`"danger"\`. */
        setType(type: 'success' | 'info' | 'warning' | 'danger'): void;
    
        /** Sets the auto-dismiss delay in milliseconds. */
        setTimeout(ms: number): void;
    
        /** Displays the notification. */
        show(): void;
    }
    
    // -----------------------------------------------------------------------------
    // GlideMenu / GlideMenuItem / g_menu / g_item — Context Menu
    // -----------------------------------------------------------------------------
    
    /**
    * Represents a single item in a GlideMenu context menu.
    * Available as \`g_item\` in context-menu client scripts.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideMenuClientSideAPI
    */
    declare class GlideMenuItem {
        /** Returns the item's display label. */
        getLabel(): string;
        /** Returns the item's internal name. */
        getName(): string;
        /** Returns the sys_id of the menu item record. */
        getSysID(): string;
        /** Returns \`true\` if the item is enabled. */
        isEnabled(): boolean;
        /** Enables or disables the item. */
        setEnabled(enabled: boolean): void;
        /** Returns \`true\` if the item is visible. */
        isVisible(): boolean;
        /** Shows or hides the item. */
        setVisible(visible: boolean): void;
        /** Returns the shorthand label text. */
        getShortHandLabel(): string;
    }
    
    /**
    * Client-side context menu manager.
    * Available as \`g_menu\` in context-menu client scripts.
    */
    declare class GlideMenu {
        /** Returns the GlideMenuItem with the given name. */
        getItem(name: string): GlideMenuItem | null;
        /** Returns an array of all items in this menu. */
        getItems(): GlideMenuItem[];
        /** Removes the named item from the menu. */
        removeItem(name: string): void;
        /** Sets the label of the named item. */
        setItemLabel(name: string, label: string): void;
        /** Enables or disables the named item. */
        setEnabled(name: string, enabled: boolean): void;
        /** Shows or hides the named item. */
        setVisible(name: string, visible: boolean): void;
    }
    
    /** Context menu instance available in context-menu client scripts. */
    declare var g_menu: GlideMenu;
    
    /** The menu item currently being processed in a context-menu client script. */
    declare var g_item: GlideMenuItem;
    
    // -----------------------------------------------------------------------------
    // GlideUIScripts — On-Demand UI Script Loader
    // -----------------------------------------------------------------------------
    
    /**
    * Loads \`sys_ui_script\` records on demand.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideUIScriptsClientAPI
    */
    declare var GlideUIScripts: {
        /**
         * Loads the named UI script and calls \`callback\` once ready.
         * @param scriptName Unique name of the \`sys_ui_script\` record.
         * @param callback Invoked when the script has finished loading.
         */
        load(scriptName: string, callback: () => void): void;
    };
    
    // -----------------------------------------------------------------------------
    // i18N — Internationalisation
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side internationalisation helper for fetching translated messages
    * from the \`sys_ui_message\` table.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_i18NAPI
    */
    declare var i18N: {
    
        /**
         * Fetches the localised string for a message key.
         * @param key Message key defined in \`sys_ui_message\`.
         * @param callback Invoked with the translated string.
         */
        getMessage(key: string, callback: (message: string) => void): void;
    
        /**
         * Fetches multiple messages in a single round-trip.
         * @param keys Array of message keys.
         * @param callback Invoked with a map of key → translated string.
         */
        getMessages(keys: string[], callback: (messages: { [key: string]: string }) => void): void;
    };
    
    // -----------------------------------------------------------------------------
    // StandaloneClientMethods — Standalone Script Helpers
    // -----------------------------------------------------------------------------
    
    /**
    * Utility methods available in standalone client scripts.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_StandaloneClientMethodsAPI
    */
    declare var StandaloneClientMethods: {
        /**
         * Returns the value of a URL query parameter.
         * @param name Parameter name.
         */
        getParameter(name: string): string;
    
        /** Returns all current URL query parameters as a key/value object. */
        getParameters(): { [key: string]: string };
    };
    
    // -----------------------------------------------------------------------------
    // DynamicTranslation — Real-Time Text Translation
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side real-time translation API.
    * Translates text into the user's preferred language.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_DynamicTranslationAPI
    */
    declare var DynamicTranslation: {
    
        /**
         * Translates an arbitrary text string.
         * @param text Source text.
         * @param callback Receives the translated string.
         */
        translate(text: string, callback: (translated: string) => void): void;
    
        /**
         * Translates the value of a specific field on a record.
         * @param table Source table name.
         * @param field Field name.
         * @param sysId sys_id of the record.
         * @param callback Receives the translated string.
         */
        translateField(table: string, field: string, sysId: string, callback: (translated: string) => void): void;
    };
    
    // -----------------------------------------------------------------------------
    // g_modal — Global Modal Shortcut
    // -----------------------------------------------------------------------------
    
    /**
    * Global shortcut to the legacy GlideModal API.
    * Available in UI16 client scripts. For Service Portal prefer \`spModal\`.
    */
    declare var g_modal: GlideModal;
    
    // -----------------------------------------------------------------------------
    // g_service_catalog — Service Catalog Client API
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side Service Catalog utility available in catalog item client scripts.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideServiceCatalogAPI
    */
    declare var g_service_catalog: {
    
        /** Returns the current catalog item model object. */
        getCatalogItem(): { [key: string]: any };
    
        /**
         * Immediately orders the current catalog item.
         * @param vars Variable name/value pairs.
         * @param quantity Number of items to order.
         * @param callback Invoked with the order result.
         */
        orderNow(vars: { [key: string]: any }, quantity?: number, callback?: (result: any) => void): void;
    
        /**
         * Adds the current catalog item to the shopping cart.
         * @param vars Variable name/value pairs.
         * @param quantity Number of items.
         * @param callback Invoked after adding.
         */
        addToCart(vars: { [key: string]: any }, quantity?: number, callback?: Function): void;
    };
    
    // -----------------------------------------------------------------------------
    // GlideList — Next Experience Related-List API
    // -----------------------------------------------------------------------------
    
    /**
    * Next Experience (Polaris) client-side related-list API.
    * Supercedes \`GlideList2\` / \`g_list\` in Next Experience contexts.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideListClientAPI
    */
    declare class GlideList {
    
        /** Returns the table name of this related list. */
        getTableName(): string;
    
        /** Returns the encoded query currently applied to this list. */
        getQuery(): string;
    
        /** Sets a new encoded query on the list. */
        setQuery(encodedQuery: string): void;
    
        /** Returns the total number of rows in the list. */
        getRowCount(): number;
    
        /** Returns the list title. */
        getTitle(): string;
    
        /** Refreshes the list by re-running the query. */
        refresh(firstRow?: number): void;
    
        /** Selects the row with the given sys_id. */
        addSelection(sysId: string): void;
    
        /** Clears all row selections. */
        clearSelection(): void;
    
        /** Returns sys_ids of all currently selected rows. */
        getSelected(): string[];
    }
    
    // -----------------------------------------------------------------------------
    // ScriptLoader — Dynamic Script Loader
    // -----------------------------------------------------------------------------
    
    /**
    * Dynamically loads JavaScript resources at runtime.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_ScriptLoaderClientAPI
    */
    declare var ScriptLoader: {
        /**
         * Loads one or more scripts, then calls \`callback\`.
         * @param scripts Array of script URLs or UI script names.
         * @param callback Invoked once all resources are loaded.
         */
        getScripts(scripts: string[], callback: () => void): void;
    };
    
    // -----------------------------------------------------------------------------
    // StopWatch — Client-Side Timer
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side stopwatch for measuring elapsed time.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_StopWatchClientAPI
    */
    declare class StopWatch {
    
        /** Starts or resumes the stopwatch. */
        start(): void;
    
        /** Stops the stopwatch. */
        stop(): void;
    
        /** Resets elapsed time to zero. */
        reset(): void;
    
        /** Returns elapsed time in milliseconds. */
        getTime(): number;
    
        /** Returns elapsed time as a formatted string (e.g. \`"0:00:01.234"\`). */
        getTimeSimple(): string;
    }
    
    // -----------------------------------------------------------------------------
    // SNAnalytics — Client Analytics
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side analytics helper for reporting user interactions.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_SNAnalyticsAPI
    */
    declare var SNAnalytics: {
    
        /**
         * Records a custom analytics event.
         * @param eventName Event type identifier.
         * @param data Optional metadata to attach to the event.
         */
        sendCustomEvent(eventName: string, data?: { [key: string]: any }): void;
    
        /**
         * Records a page-load event.
         * @param pageId Optional page identifier.
         */
        pageLoad(pageId?: string): void;
    };
    

    
    // -----------------------------------------------------------------------------
    // spContextManager — Service Portal Context Manager
    // -----------------------------------------------------------------------------
    
    /**
    * Controls portal-level navigation and page-context state.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/sp-context-manager-api
    */
    declare var spContextManager: {
    
        /** Returns the current portal page id. */
        getCurrentPageId(): string;
    
        /**
         * Navigates the portal to a different page.
         * @param pageId Target portal page id.
         * @param params URL parameters to add.
         */
        navigateToPage(pageId: string, params?: { [key: string]: string }): void;
    
        /**
         * Opens a record in the portal.
         * @param table Table name.
         * @param sysId sys_id of the record.
         */
        openRecord(table: string, sysId: string): void;
    };
    
    // -----------------------------------------------------------------------------
    // openFrameAPI — OpenFrame CTI Integration
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for the ServiceNow OpenFrame telephony integration.
    * Used to embed and communicate with third-party CTI toolbars.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_OpenFrameAPI
    */
    declare var openFrameAPI: {
    
        /**
         * Initialises the OpenFrame API.
         * @param config Configuration object.
         */
        initialize(config: { [key: string]: any }): void;
    
        /**
         * Sets one or more OpenFrame property values.
         * @param properties Key-value pairs.
         */
        setProperties(properties: { [key: string]: any }): void;
    
        /**
         * Registers a listener for a named OpenFrame event.
         * @param eventName Event name (e.g. \`"screenpop"\`, \`"callAnswered"\`).
         * @param callback Invoked with the event payload.
         */
        subscribeEvent(eventName: string, callback: (payload: any) => void): void;
    
        /**
         * Sends a named event to the CTI toolbar iframe.
         * @param eventName Event name recognised by the CTI application.
         * @param payload Data passed with the event.
         */
        sendEvent(eventName: string, payload?: any): void;
    
        /** Shows the OpenFrame toolbar. */
        enable(): void;
    
        /** Hides the OpenFrame toolbar. */
        disable(): void;
    
        /**
         * Resizes the OpenFrame toolbar.
         * @param width New width in pixels.
         * @param height New height in pixels.
         */
        resize(width: number, height: number): void;
    
        /** Returns the current OpenFrame properties. */
        getProperties(): { [key: string]: any };
    };
    
    // -----------------------------------------------------------------------------
    // ScopedSessionDomain — Domain Session API
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for reading and switching the active session domain.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_ScopedSessionDomainAPI
    */
    declare var ScopedSessionDomain: {
    
        /** Returns the sys_id of the current session domain. */
        getCurrentDomain(): string;
    
        /** Returns the display name of the current session domain. */
        getCurrentDomainDisplayValue(): string;
    
        /**
         * Switches the active session domain.
         * @param domainSysId sys_id of the domain to activate.
         * @param callback Invoked after the switch completes.
         */
        setCurrentDomain(domainSysId: string, callback?: Function): void;
    };
    
    // -----------------------------------------------------------------------------
    // NotifyClient — Notify Voice / SMS
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for the ServiceNow Notify telephony integration.
    * Provides voice call and SMS controls from the browser.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_NotifyClientAPI
    */
    declare class NotifyClient {
    
        /** Creates a NotifyClient instance. */
        constructor();
    
        /**
         * Initiates an outbound phone call.
         * @param to Destination phone number or SIP URI.
         * @param from Caller-ID number.
         */
        call(to: string, from?: string): void;
    
        /** Hangs up the current call. */
        hangup(): void;
    
        /** Puts the current call on hold. */
        hold(): void;
    
        /** Resumes a held call. */
        unhold(): void;
    
        /**
         * Adds a third party to create a conference call.
         * @param to Phone number to add.
         */
        conference(to: string): void;
    
        /**
         * Transfers the current call.
         * @param to Destination number or SIP URI.
         */
        transfer(to: string): void;
    
        /** Accepts an incoming call. */
        accept(): void;
    
        /** Rejects an incoming call. */
        reject(): void;
    
        /**
         * Sends DTMF tones during a call.
         * @param digits DTMF string (0–9, *, #).
         */
        sendDtmf(digits: string): void;
    
        /**
         * Mutes or unmutes the microphone.
         * @param muted \`true\` to mute.
         */
        setMuted(muted: boolean): void;
    
        /**
         * Registers an event listener.
         * @param event Event name (e.g. \`"incoming"\`, \`"connected"\`, \`"disconnected"\`).
         * @param handler Callback invoked with event data.
         */
        on(event: string, handler: (data?: any) => void): void;
    }
    
    // -----------------------------------------------------------------------------
    // NotifyOnTaskClient — Notify Scoped to a Task Record
    // -----------------------------------------------------------------------------
    
    /**
    * Notify client scoped to a specific task record.
    * Extends NotifyClient with task-awareness.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_NotifyOnTaskClientAPI
    */
    declare class NotifyOnTaskClient extends NotifyClient {
    
        /**
         * Creates a NotifyOnTaskClient tied to a task record.
         * @param tableName The task table name (e.g. \`"incident"\`).
         * @param sysId sys_id of the task record.
         */
        constructor(tableName: string, sysId: string);
    
        /** Returns the table name this client is scoped to. */
        getTableName(): string;
    
        /** Returns the sys_id this client is scoped to. */
        getSysId(): string;
    }
    
    // -----------------------------------------------------------------------------
    // GlideAgentWorkspace / g_aw — Agent Workspace
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for controlling the Agent Workspace UI.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GlideAgentWorkspaceAPI
    */
    declare class GlideAgentWorkspace {
    
        /**
         * Opens a record in the Agent Workspace.
         * @param tableName Table of the record.
         * @param sysId sys_id of the record.
         */
        openRecord(tableName: string, sysId: string): void;
    
        /**
         * Closes a record tab.
         * @param tableName Table of the record.
         * @param sysId sys_id of the record.
         */
        closeRecord(tableName: string, sysId: string): void;
    
        /**
         * Opens a new (blank) record form.
         * @param tableName Table for the new record.
         * @param encodedQuery Optional encoded query to pre-populate fields.
         */
        openNewRecord(tableName: string, encodedQuery?: string): void;
    
        /**
         * Navigates to a URL within the Agent Workspace.
         * @param url Target URL.
         */
        navigate(url: string): void;
    
        /** Returns the sys_id of the record in the currently focused tab. */
        getCurrentRecordSysId(): string;
    
        /** Returns the table name of the record in the currently focused tab. */
        getCurrentRecordTableName(): string;
    }
    
    /** Global Agent Workspace API instance. Available in Agent Workspace client scripts. */
    declare var g_aw: GlideAgentWorkspace;
    
    // -----------------------------------------------------------------------------
    // GuidedTours — Guided Tour API
    // -----------------------------------------------------------------------------
    
    /**
    * Client-side API for launching and controlling ServiceNow Guided Tours.
    *
    * @see https://developer.servicenow.com/dev.do#!/reference/api/xanadu/client/c_GuidedToursAPI
    */
    declare var GuidedTours: {
    
        /**
         * Launches a guided tour.
         * @param tourId sys_id or name of the tour.
         */
        start(tourId: string): void;
    
        /** Stops the currently running guided tour. */
        stop(): void;
    
        /**
         * Registers a tour definition programmatically.
         * @param definition Tour definition object (steps, title, etc.).
         */
        register(definition: { [key: string]: any }): void;
    
        /** Returns \`true\` if a guided tour is currently running. */
        isRunning(): boolean;
    };
    
    // ---- AngularJS ng Directives ------------------------------------------------
    
    /**
    * AngularJS built-in directive attribute type declarations.
    * Each interface describes the HTML attributes accepted by the corresponding directive.
    */
    declare namespace ng {
        /**
         * Interfaces describing the HTML attributes for each AngularJS built-in directive.
         * Use these as references when writing AngularJS template HTML inside widgets.
         */
        namespace directive {
    
            /**
             * Forces AngularJS to use a specific instance of jQuery instead of the
             * default window.jQuery. Place as an attribute on the element that
             * also carries ng-app.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngJq}
             */
            interface NgJqAttributes {
                /**
                 * Name of the variable under window that holds the jQuery library.
                 * Defaults to 'jQuery' if absent.
                 */
                ngJq?: string;
            }
    
            /**
             * Bootstraps the AngularJS application. Designates the root element of
             * the application and optionally specifies the root module.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngApp}
             */
            interface NgAppAttributes {
                /**
                 * Optional name of the AngularJS module to use as the root module
                 * for the application.
                 */
                ngApp?: string;
                /**
                 * If present, the application refuses to create controllers, services,
                 * or directives with implicit dependencies (enforces explicit DI).
                 */
                ngStrictDi?: boolean;
            }
    
            /**
             * Binds a DOM element property to an AngularJS expression.
             * The attribute name is ng-prop-{propname} where propname is the
             * camelCase DOM property to set (e.g. ng-prop-inner-text, ng-prop-value).
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngProp}
             */
            interface NgPropAttributes {
                /**
                 * Dynamic attribute pattern: ng-prop-{propname}="expression".
                 * Replace {propname} with the camelCase DOM property to set.
                 * The expression result is assigned directly to the DOM property.
                 * Example: ng-prop-inner-text="myVar"
                 */
                [ngPropAttr: string]: any;
            }
    
            /**
             * Binds a DOM event listener to an AngularJS expression.
             * The attribute name is ng-on-{eventname} where eventname is the
             * DOM event to listen for (e.g. ng-on-click, ng-on-custom-event).
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngOn}
             */
            interface NgOnAttributes {
                /**
                 * Dynamic attribute pattern: ng-on-{eventname}="expression".
                 * Replace {eventname} with the camelCase DOM event name.
                 * The expression is evaluated each time the event fires.
                 * Example: ng-on-click="myHandler($event)"
                 */
                [ngOnAttr: string]: any;
            }
    
            /**
             * Modifies the default behavior of the HTML anchor element so that
             * the default action is prevented when the href attribute is empty.
             * @see {@link https://docs.angularjs.org/api/ng/directive/a}
             */
            interface AnchorAttributes {
                /** Standard HTML href. When empty, AngularJS prevents the default action. */
                href?: string;
            }
    
            /**
             * Interpolates the given template string and sets the href attribute,
             * preventing the browser from navigating to an empty URL during bootstrap.
             * Use instead of href when the URL contains AngularJS interpolation.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngHref}
             */
            interface NgHrefAttributes {
                /**
                 * Template string with optional AngularJS interpolation markup
                 * (e.g. 'https://example.com/{{userId}}').
                 */
                ngHref?: string;
            }
    
            /**
             * Interpolates the given template string and sets the src attribute.
             * Use instead of src when the URL contains AngularJS interpolation
             * to avoid a bad request before AngularJS bootstraps.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSrc}
             */
            interface NgSrcAttributes {
                /** Template string with optional AngularJS interpolation markup. */
                ngSrc?: string;
            }
    
            /**
             * Interpolates the given template string and sets the srcset attribute.
             * Use instead of srcset when the value contains AngularJS interpolation.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSrcset}
             */
            interface NgSrcsetAttributes {
                /** Template string with optional AngularJS interpolation markup. */
                ngSrcset?: string;
            }
    
            /**
             * Sets the disabled attribute on the element if the expression is truthy.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngDisabled}
             */
            interface NgDisabledAttributes {
                /** If the expression is truthy, the disabled attribute is set. */
                ngDisabled?: string;
            }
    
            /**
             * Sets the checked attribute on the element if the expression is truthy.
             * Unlike ngModel, ngChecked does not participate in two-way data binding.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngChecked}
             */
            interface NgCheckedAttributes {
                /** If the expression is truthy, the checked attribute is set. */
                ngChecked?: string;
            }
    
            /**
             * Sets the readonly attribute on the element if the expression is truthy.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngReadonly}
             */
            interface NgReadonlyAttributes {
                /** If the expression is truthy, the readonly attribute is set. */
                ngReadonly?: string;
            }
    
            /**
             * Sets the selected attribute on the element if the expression is truthy.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSelected}
             */
            interface NgSelectedAttributes {
                /** If the expression is truthy, the selected attribute is set. */
                ngSelected?: string;
            }
    
            /**
             * Sets the open attribute on a details element if the expression is truthy.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngOpen}
             */
            interface NgOpenAttributes {
                /** If the expression is truthy, the open attribute is set on the element. */
                ngOpen?: string;
            }
    
            /**
             * Nestable alias of the form element. Allows form elements to be nested
             * inside a standard HTML form while still getting AngularJS form validation.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngForm}
             */
            interface NgFormAttributes {
                /**
                 * Name of the form in the current scope. When specified, the FormController
                 * is published to the scope under this name.
                 */
                name?: string;
            }
    
            /**
             * Instantiates FormController. If the name attribute is specified,
             * the form controller is published onto the current scope.
             * @see {@link https://docs.angularjs.org/api/ng/directive/form}
             */
            interface FormAttributes {
                /** Name of the form. Published to the scope as a FormController instance. */
                name?: string;
            }
    
            /**
             * HTML textarea element with AngularJS data-binding, ngModel,
             * and validation directives.
             * @see {@link https://docs.angularjs.org/api/ng/directive/textarea}
             */
            interface TextareaAttributes {
                /** Assignable AngularJS expression to bind to. */
                ngModel: string;
                /** Property name of the form under which the control is published. */
                name?: string;
                /** Sets required validation error key if the value is empty. */
                required?: string;
                /** Sets required validation error key dynamically when truthy. */
                ngRequired?: string;
                /** Sets minlength validation error key if the value length is too short. */
                ngMinlength?: number | string;
                /** Sets maxlength validation error key if the value length is too long. */
                ngMaxlength?: number | string;
                /** Sets pattern validation error key if the value does not match RegExp. */
                ngPattern?: string;
                /** Expression evaluated when the value changes due to user interaction. */
                ngChange?: string;
                /** If false, whitespace is not trimmed. Defaults to true. */
                ngTrim?: boolean | string;
            }
    
            /**
             * HTML input element with AngularJS data-binding, ngModel, and validation.
             * Supports types: text, number, url, email, date, time, datetime-local,
             * month, week, checkbox, radio, range, file.
             * @see {@link https://docs.angularjs.org/api/ng/directive/input}
             */
            interface InputAttributes {
                /** Assignable AngularJS expression to bind to. */
                ngModel?: string;
                /** Property name of the form under which the control is published. */
                name?: string;
                /** Sets required validation error key if the value is empty. */
                required?: string;
                /** Sets required validation error key dynamically when truthy. */
                ngRequired?: string;
                /** Sets minlength validation error key if the value length is too short. */
                ngMinlength?: number | string;
                /** Sets maxlength validation error key if the value length is too long. */
                ngMaxlength?: number | string;
                /** Sets pattern validation error key if the value does not match. */
                ngPattern?: string;
                /** AngularJS expression evaluated when the user changes the value. */
                ngChange?: string;
                /** If false, whitespace is not trimmed. Defaults to true (text only). */
                ngTrim?: boolean | string;
            }
    
            /**
             * Binds the given expression to the value attribute of input[radio]
             * or select <option> elements, ensuring the correct type is used.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngValue}
             */
            interface NgValueAttributes {
                /**
                 * AngularJS expression whose result is assigned as the value attribute.
                 */
                ngValue?: string;
            }
    
            /**
             * Evaluates the expression and inserts the resulting text into the element,
             * replacing any child elements. Equivalent to {{ expression }} but preferred
             * when you need to avoid a flash of unrendered content.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngBind}
             */
            interface NgBindAttributes {
                /**
                 * AngularJS expression. The text content of the element is set
                 * to the result of this expression.
                 */
                ngBind?: string;
            }
    
            /**
             * Evaluates the expression and inserts the result as HTML into the element.
             * The HTML is sanitized by $sanitize before insertion (requires ngSanitize).
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngBindHtml}
             */
            interface NgBindHtmlAttributes {
                /** Expression to evaluate. The resulting HTML is sanitized and inserted. */
                ngBindHtml?: string;
            }
    
            /**
             * Binds the contents of a string template that may contain
             * {{ interpolation }} markup to the text content of the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngBindTemplate}
             */
            interface NgBindTemplateAttributes {
                /**
                 * A string template with AngularJS interpolation expressions
                 * (e.g. 'Hello {{first}} {{last}}!').
                 */
                ngBindTemplate?: string;
            }
    
            /**
             * Evaluates the given expression when the user changes the input.
             * The expression is evaluated immediately, not debounced.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngChange}
             */
            interface NgChangeAttributes {
                /** Expression to evaluate when the model value changes due to user input. */
                ngChange?: string;
            }
    
            /**
             * Dynamically binds one or more CSS classes to an element. The expression
             * can be a string, an array of class names, or an object map of
             * { className: boolean } pairs.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngClass}
             */
            interface NgClassAttributes {
                /**
                 * Expression evaluating to: a string of space-separated class names,
                 * an array of class name strings, or an object whose keys are class names
                 * and values are boolean expressions.
                 */
                ngClass?: string;
            }
    
            /**
             * Like ngClass but only applied to odd-numbered rows (1, 3, 5, …) in ngRepeat.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngClassOdd}
             */
            interface NgClassOddAttributes {
                /** Expression for odd rows. Same shape as ngClass (string, array, or object). */
                ngClassOdd?: string;
            }
    
            /**
             * Like ngClass but only applied to even-numbered rows (2, 4, 6, …) in ngRepeat.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngClassEven}
             */
            interface NgClassEvenAttributes {
                /** Expression for even rows. Same shape as ngClass (string, array, or object). */
                ngClassEven?: string;
            }
    
            /**
             * Prevents the element and its children from being compiled and interpolated.
             * Useful during page load to prevent flashing of unrendered content.
             * The ng-cloak CSS class is removed once AngularJS bootstraps.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngCloak}
             */
            interface NgCloakAttributes {
                /** Presence of this attribute hides the element until AngularJS bootstraps. */
                ngCloak?: string;
            }
    
            /**
             * Attaches a controller class to the view. The ng-controller expression
             * can reference a constructor function directly or use the
             * 'ControllerName as alias' syntax to publish the instance to the scope.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngController}
             */
            interface NgControllerAttributes {
                /**
                 * Name of a globally accessible constructor function, or an expression
                 * that evaluates to a constructor. Use 'CtrlName as alias' to publish
                 * the controller instance as a scope property.
                 */
                ngController?: string;
            }
    
            /**
             * Enables CSP (Content Security Policy) compatibility mode.
             * Presence of this attribute disables use of eval() in AngularJS.
             * Place on the same element as ng-app, or on the html/body element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngCsp}
             */
            interface NgCspAttributes {
                /** Presence of this attribute activates CSP-compatible mode. */
                ngCsp?: string;
            }
    
            /**
             * Evaluates the expression when the element is clicked.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngClick}
             */
            interface NgClickAttributes {
                /** Expression to evaluate on click. $event is the DOM MouseEvent. */
                ngClick?: string;
            }
    
            /**
             * Evaluates the expression when the element is double-clicked.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngDblclick}
             */
            interface NgDblclickAttributes {
                /** Expression to evaluate on double-click. */
                ngDblclick?: string;
            }
    
            /**
             * Evaluates the expression when the mousedown event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMousedown}
             */
            interface NgMousedownAttributes {
                /** Expression to evaluate on mousedown. */
                ngMousedown?: string;
            }
    
            /**
             * Evaluates the expression when the mouseup event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMouseup}
             */
            interface NgMouseupAttributes {
                /** Expression to evaluate on mouseup. */
                ngMouseup?: string;
            }
    
            /**
             * Evaluates the expression when the mouseover event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMouseover}
             */
            interface NgMouseoverAttributes {
                /** Expression to evaluate on mouseover. */
                ngMouseover?: string;
            }
    
            /**
             * Evaluates the expression when the mouseenter event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMouseenter}
             */
            interface NgMouseenterAttributes {
                /** Expression to evaluate on mouseenter. */
                ngMouseenter?: string;
            }
    
            /**
             * Evaluates the expression when the mouseleave event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMouseleave}
             */
            interface NgMouseleaveAttributes {
                /** Expression to evaluate on mouseleave. */
                ngMouseleave?: string;
            }
    
            /**
             * Evaluates the expression when the mousemove event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMousemove}
             */
            interface NgMousemoveAttributes {
                /** Expression to evaluate on mousemove. */
                ngMousemove?: string;
            }
    
            /**
             * Evaluates the expression when the keydown event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngKeydown}
             */
            interface NgKeydownAttributes {
                /** Expression to evaluate on keydown. $event is the DOM KeyboardEvent. */
                ngKeydown?: string;
            }
    
            /**
             * Evaluates the expression when the keyup event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngKeyup}
             */
            interface NgKeyupAttributes {
                /** Expression to evaluate on keyup. */
                ngKeyup?: string;
            }
    
            /**
             * Evaluates the expression when the keypress event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngKeypress}
             */
            interface NgKeypressAttributes {
                /** Expression to evaluate on keypress. */
                ngKeypress?: string;
            }
    
            /**
             * Evaluates the expression when the form is submitted.
             * Prevents default browser submission when the form is invalid.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSubmit}
             */
            interface NgSubmitAttributes {
                /** Expression to evaluate on form submit. */
                ngSubmit?: string;
            }
    
            /**
             * Evaluates the expression when the focus event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngFocus}
             */
            interface NgFocusAttributes {
                /** Expression to evaluate when the element receives focus. */
                ngFocus?: string;
            }
    
            /**
             * Evaluates the expression when the blur event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngBlur}
             */
            interface NgBlurAttributes {
                /** Expression to evaluate when the element loses focus. */
                ngBlur?: string;
            }
    
            /**
             * Evaluates the expression when the copy event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngCopy}
             */
            interface NgCopyAttributes {
                /** Expression to evaluate on copy. */
                ngCopy?: string;
            }
    
            /**
             * Evaluates the expression when the cut event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngCut}
             */
            interface NgCutAttributes {
                /** Expression to evaluate on cut. */
                ngCut?: string;
            }
    
            /**
             * Evaluates the expression when the paste event fires on the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngPaste}
             */
            interface NgPasteAttributes {
                /** Expression to evaluate on paste. */
                ngPaste?: string;
            }
    
            /**
             * Conditionally removes or recreates a portion of the DOM tree based
             * on an expression. Unlike ngShow/ngHide, ngIf removes the element from
             * the DOM entirely and destroys its scope when the expression is falsy.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngIf}
             */
            interface NgIfAttributes {
                /**
                 * Expression to evaluate. If falsy, the element and its subtree
                 * are removed from the DOM; if truthy, they are re-created.
                 */
                ngIf?: string;
            }
    
            /**
             * Fetches, compiles, and includes an external HTML fragment into the current
             * scope. Can be used as an attribute or element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngInclude}
             */
            interface NgIncludeAttributes {
                /**
                 * AngularJS expression evaluating to the URL of the template to include.
                 * String literal URLs must be quoted: ng-include="'template.html'".
                 */
                ngInclude?: string;
                /** Alias for ngInclude (used on the <ng-include> element as src attribute). */
                src?: string;
                /** Expression evaluated after the template is loaded and linked. */
                onload?: string;
                /**
                 * Whether the included template should be scrolled into view.
                 * If omitted or falsy, no scroll. If truthy, $anchorScroll is called.
                 */
                autoscroll?: string;
            }
    
            /**
             * Evaluates the given expression in the current scope.
             * Useful for setting up default values without writing a dedicated controller.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngInit}
             */
            interface NgInitAttributes {
                /**
                 * Expression to evaluate. Multiple expressions can be separated
                 * by semicolons.
                 */
                ngInit?: string;
            }
    
            /**
             * Converts a string of delimited values into an array and back.
             * Works in conjunction with ngModel on text inputs.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngList}
             */
            interface NgListAttributes {
                /**
                 * Optional delimiter string or RegExp literal. Defaults to ', '.
                 * A string is used for both splitting and joining;
                 * a RegExp literal is used for splitting only.
                 */
                ngList?: string;
            }
    
            /**
             * Binds the view (input, select, textarea) to a model property in scope.
             * Provides two-way data binding, input state tracking, and validation.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngModel}
             */
            interface NgModelAttributes {
                /**
                 * Assignable AngularJS expression (string) to bind to.
                 * Evaluated in the context of the current scope.
                 */
                ngModel?: string;
            }
    
            /**
             * Provides options for overriding the default behavior of ngModel,
             * including when and how the model is updated.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngModelOptions}
             */
            interface NgModelOptionsAttributes {
                /**
                 * Object expression with the following optional properties:
                 * - updateOn {string}: space-separated list of events that trigger model
                 *   update. Use 'default' to include built-in triggers.
                 * - debounce {number|object}: milliseconds to debounce model updates.
                 *   Can be keyed by event name for per-event debouncing.
                 * - allowInvalid {boolean}: update model even when the value is invalid.
                 * - getterSetter {boolean}: treat model expression as a getter/setter.
                 * - timezone {string}: timezone for date/time inputs (e.g. 'UTC', '+0500').
                 * - timeSecondsFormat {string}: format for seconds in time inputs.
                 * - timeStripZeroSeconds {boolean}: strip :00 seconds from displayed time.
                 */
                ngModelOptions?: string;
            }
    
            /**
             * Prevents AngularJS from compiling or interpolating the contents of
             * the element. Useful for displaying raw AngularJS template syntax.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngNonBindable}
             */
            interface NgNonBindableAttributes {
                /** Presence of this attribute disables compilation of the subtree. */
                ngNonBindable?: string;
            }
    
            /**
             * Generates a list of <option> elements for a <select> element based on
             * a collection. Used together with the select directive and ngModel.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngOptions}
             */
            interface NgOptionsAttributes {
                /** Assignable AngularJS expression for the selected value. */
                ngModel?: string;
                /**
                 * Comprehension expression to generate options. Syntax variants:
                 * - label for value in array
                 * - select as label for value in array
                 * - label group by group for value in array
                 * - label disable when disable for value in array
                 * - label for (key, value) in object
                 * These can be combined, e.g.: label group by group for value in array track by value.id
                 */
                ngOptions?: string;
                /** Property name of the form under which the select is published. */
                name?: string;
                /** Sets required validation if no option is selected. */
                required?: string;
                /** Sets required validation dynamically. */
                ngRequired?: string;
                /** Binds the size attribute via interpolation. */
                ngAttrSize?: string;
            }
    
            /**
             * Displays a message according to how the given number compares to
             * thresholds defined in a JSON mapping object. Used for pluralization.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngPluralize}
             */
            interface NgPluralizeAttributes {
                /**
                 * The number to compare against thresholds. Can be a number literal
                 * or an AngularJS expression evaluating to a number.
                 */
                count: string;
                /**
                 * JSON object mapping count values to message strings.
                 * Use exact numbers, 'one\ or 'other' as keys.
                 * Use {} in the message string as a placeholder for the count.
                 * Example: when="{'0': 'Nobody\ 'one': '1 person\ 'other': '{} people'}"
                 */
                when: string;
                /**
                 * Optional number to subtract from count before applying thresholds.
                 * Useful when you want to exclude some items from the count display.
                 */
                offset?: number | string;
            }
    
            /**
             * Binds the closest parent element or component matching a directive to
             * a scope property, letting a parent template access a child's API.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngRef}
             */
            interface NgRefAttributes {
                /**
                 * Name of the scope property to assign the component controller or
                 * element reference to.
                 */
                ngRef: string;
                /**
                 * Optional name of the directive whose controller to read from the element.
                 * Use '$element' to get the DOM element wrapped in jqLite.
                 */
                ngRefRead?: string;
            }
    
            /**
             * Instantiates a template once per item in a collection.
             * Creates a new scope for each item. Supports filtering, ordering,
             * and track-by expressions for performance optimization.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngRepeat}
             */
            interface NgRepeatAttributes {
                /**
                 * Repeat expression. Supported forms:
                 * - variable in expression
                 * - (key, value) in expression
                 * - variable in expression track by tracking_expression
                 * - variable in expression as alias_expression
                 * - variable in expression | filter:x | orderBy:y track by z
                 */
                ngRepeat?: string;
            }
    
            /**
             * Shows or hides the element based on the expression.
             * Uses CSS display:none (does not remove from DOM) to hide the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngShow}
             */
            interface NgShowAttributes {
                /**
                 * Expression that determines visibility. If truthy, the element is
                 * shown; if falsy, the ng-hide CSS class is added.
                 */
                ngShow?: string;
            }
    
            /**
             * Hides or shows the element based on the expression.
             * Uses CSS display:none (does not remove from DOM) to hide the element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngHide}
             */
            interface NgHideAttributes {
                /**
                 * Expression that determines visibility. If truthy, the element is
                 * hidden via ng-hide CSS class; if falsy, the element is shown.
                 */
                ngHide?: string;
            }
    
            /**
             * Allows setting CSS styles on an element using an object expression.
             * Safe for use with expressions that update frequently.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngStyle}
             */
            interface NgStyleAttributes {
                /**
                 * Expression evaluating to a key-value CSS object.
                 * Example: ng-style="{ color: myColor, fontSize: mySize + 'px' }".
                 */
                ngStyle?: string;
            }
    
            /**
             * Provides a switch/case-like pattern for conditional rendering.
             * Child elements use ng-switch-when and ng-switch-default to define cases.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSwitch}
             */
            interface NgSwitchAttributes {
                /**
                 * Expression to evaluate. Its string value is compared against
                 * the ng-switch-when values on child elements.
                 */
                ngSwitch?: string;
                /** Alias for ngSwitch (used as the on attribute). */
                on?: string;
            }
    
            /**
             * Child of ngSwitch — renders when its value matches the parent switch expression.
             * Multiple ng-switch-when attributes can be placed on the same element.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSwitch}
             */
            interface NgSwitchWhenAttributes {
                /**
                 * Value to compare against the ngSwitch expression.
                 * The element is rendered when the switch expression matches this value.
                 */
                ngSwitchWhen?: string;
            }
    
            /**
             * Child of ngSwitch — rendered when no sibling ng-switch-when clause matches.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngSwitch}
             */
            interface NgSwitchDefaultAttributes {
                /** Presence of this attribute marks the element as the default case. */
                ngSwitchDefault?: string;
            }
    
            /**
             * Works with directives that support transclusion to mark the insertion
             * point for transcluded content. Supports named slots for multi-slot
             * transclusion.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngTransclude}
             */
            interface NgTranscludeAttributes {
                /**
                 * Name of the transclusion slot to fill. Leave empty (or omit)
                 * for the default transclusion slot. Alias: ng-transclude-slot.
                 */
                ngTransclude?: string;
                /** Alias for ngTransclude — the named slot to fill. */
                ngTranscludeSlot?: string;
            }
    
            /**
             * Puts the contents of a script block into the $templateCache under
             * the given id, making it available to ng-include and directives as
             * an inline template.
             * @see {@link https://docs.angularjs.org/api/ng/directive/script}
             */
            interface ScriptTemplateAttributes {
                /**
                 * Must be set to "text/ng-template" for AngularJS to process the
                 * script element as an inline template.
                 */
                type: string;
                /**
                 * The key under which the template is stored in $templateCache.
                 * Use this id as the template URL in ng-include or directive templateUrl.
                 */
                id: string;
            }
    
            /**
             * HTML select element with AngularJS data-binding via ngModel.
             * Can render static <option> elements or use ngOptions for dynamic options.
             * @see {@link https://docs.angularjs.org/api/ng/directive/select}
             */
            interface SelectAttributes {
                /** Assignable AngularJS expression to bind the selected value to. */
                ngModel: string;
                /** Property name of the form under which the control is published. */
                name?: string;
                /** Indicates that multiple options can be selected simultaneously. */
                multiple?: string;
                /** Sets required validation if no option is selected. */
                required?: string;
                /** Sets required validation dynamically. */
                ngRequired?: string;
                /** Expression evaluated when the selected option changes. */
                ngChange?: string;
                /** Options comprehension expression (see NgOptionsAttributes.ngOptions). */
                ngOptions?: string;
                /** Binds the size attribute via interpolation. */
                ngAttrSize?: string;
            }
    
            /**
             * Adds a required constraint to an ngModel-bound input dynamically.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngRequired}
             */
            interface NgRequiredAttributes {
                /**
                 * Expression that, when truthy, adds the required constraint
                 * to the input and marks it with the required CSS class.
                 */
                ngRequired?: string;
            }
    
            /**
             * Adds pattern validation to an ngModel-bound input.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngPattern}
             */
            interface NgPatternAttributes {
                /**
                 * RegExp pattern string, or an expression evaluating to a RegExp.
                 * The model value must match this pattern to pass validation.
                 */
                ngPattern?: string;
            }
    
            /**
             * Adds maximum-length validation to an ngModel-bound input.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMaxlength}
             */
            interface NgMaxlengthAttributes {
                /**
                 * Expression evaluating to the maximum number of characters allowed.
                 * Setting to -1 disables the constraint.
                 */
                ngMaxlength?: number | string;
            }
    
            /**
             * Adds minimum-length validation to an ngModel-bound input.
             * @see {@link https://docs.angularjs.org/api/ng/directive/ngMinlength}
             */
            interface NgMinlengthAttributes {
                /**
                 * Expression evaluating to the minimum number of characters required.
                 */
                ngMinlength?: number | string;
            }
        }
    }
    
    // -----------------------------------------------------------------------------
    // jQuery type declarations
    // Available as $j (ServiceNow alias), jQuery, and $ in widget controllers.
    // -----------------------------------------------------------------------------
    
    /** jQuery event object passed to event handler callbacks. */
    interface JQueryEventObject {
        /** The DOM element that initiated the event. */
        target: Element;
        /** The current DOM element within the event bubbling phase. */
        currentTarget: Element;
        /** The element where the currently-called handler was attached. */
        delegateTarget: Element;
        /** For mouse events, the element the pointer left or entered. */
        relatedTarget: Element;
        /** The native browser event object. */
        originalEvent: Event;
        /** The namespace associated with the event. */
        namespace: string;
        /** The event type (e.g. "click", "keyup"). */
        type: string;
        /** Unix timestamp of when the event was created. */
        timeStamp: number;
        /** For keyboard/mouse events, the key or button code. */
        which: number;
        /** Mouse pointer X position relative to the document. */
        pageX: number;
        /** Mouse pointer Y position relative to the document. */
        pageY: number;
        /** The last value returned by a handler for this event, undefined otherwise. */
        result: any;
        /** Data passed to the handler via .on() or .bind(). */
        data: any;
        /** Prevents the default browser action for the event. */
        preventDefault(): void;
        /** Stops the event from bubbling up the DOM tree. */
        stopPropagation(): void;
        /** Prevents other handlers on the same element and stops bubbling. */
        stopImmediatePropagation(): void;
        /** Returns true if preventDefault() was called. */
        isDefaultPrevented(): boolean;
        /** Returns true if stopPropagation() was called. */
        isPropagationStopped(): boolean;
        /** Returns true if stopImmediatePropagation() was called. */
        isImmediatePropagationStopped(): boolean;
    }
    
    /** Settings object for jQuery.ajax(). */
    interface JQueryAjaxSettings {
        /** The URL to which the request is sent. */
        url?: string;
        /** HTTP method ("GET", "POST", etc.). Alias: method. */
        type?: string;
        /** HTTP method — preferred alias for type since jQuery 1.9. */
        method?: string;
        /** Data to be sent to the server. */
        data?: any;
        /** Expected response data type ("json", "xml", "html", "text", "script", "jsonp"). */
        dataType?: string;
        /** Content-Type header for the request body. Set to false to skip. */
        contentType?: string | false;
        /** Additional request headers. */
        headers?: Record<string, string>;
        /** Callback invoked on success. */
        success?: (data: any, textStatus: string, jqXHR: JQueryXHR) => void;
        /** Callback invoked on error. */
        error?: (jqXHR: JQueryXHR, textStatus: string, errorThrown: string) => void;
        /** Callback invoked when the request finishes (success or error). */
        complete?: (jqXHR: JQueryXHR, textStatus: string) => void;
        /** Callback invoked before the request is sent; return false to cancel. */
        beforeSend?: (jqXHR: JQueryXHR, settings: JQueryAjaxSettings) => boolean | void;
        /** Timeout in milliseconds before the request is aborted. */
        timeout?: number;
        /** Set to false to make a synchronous request (discouraged). */
        async?: boolean;
        /** Whether browser caching is allowed. */
        cache?: boolean;
        /** Send credentials (cookies, auth headers) for cross-domain requests. */
        xhrFields?: Record<string, any>;
        /** Override the MIME type returned by the server. */
        mimeType?: string;
        /** Whether to process the data (set false for FormData). */
        processData?: boolean;
        /** Context object for all callbacks. */
        context?: any;
        /** Override the callback function name in a JSONP request. */
        jsonpCallback?: string | (() => string);
        /** Cross-domain request flag. */
        crossDomain?: boolean;
        /** If true, triggers global AJAX event handlers. */
        global?: boolean;
        /** Username for HTTP authentication. */
        username?: string;
        /** Password for HTTP authentication. */
        password?: string;
    }
    
    /** jQuery XMLHttpRequest wrapper returned by $.ajax(). */
    interface JQueryXHR {
        readyState: number;
        responseText: string;
        responseXML: Document | null;
        status: number;
        statusText: string;
        done(callback: (data: any, textStatus: string, jqXHR: JQueryXHR) => void): this;
        fail(callback: (jqXHR: JQueryXHR, textStatus: string, errorThrown: string) => void): this;
        always(callback: (...args: any[]) => void): this;
        then<R>(onFulfilled?: (...args: any[]) => R, onRejected?: (...args: any[]) => any): JQueryPromise<R>;
        abort(statusText?: string): void;
        getResponseHeader(header: string): string | null;
        setRequestHeader(header: string, value: string): void;
        overrideMimeType(mimeType: string): void;
    }
    
    /** Deferred object for creating custom asynchronous workflows. */
    interface JQueryDeferred<T> {
        /** Adds a handler called when the deferred is resolved. */
        done(callback: (...args: any[]) => void): this;
        /** Adds a handler called when the deferred is rejected. */
        fail(callback: (...args: any[]) => void): this;
        /** Adds a handler called regardless of resolution or rejection. */
        always(callback: (...args: any[]) => void): this;
        /** Chains resolution/rejection into a new promise. */
        then<R>(onFulfilled?: (...args: any[]) => R | JQueryPromise<R>, onRejected?: (...args: any[]) => any): JQueryPromise<R>;
        /** Resolves the deferred, invoking all done handlers. */
        resolve(...args: any[]): this;
        /** Rejects the deferred, invoking all fail handlers. */
        reject(...args: any[]): this;
        /** Sends progress notifications to progress handlers. */
        notify(...args: any[]): this;
        /** Returns a promise object for this deferred. */
        promise(target?: any): JQueryPromise<T>;
        /** Returns "pending", "resolved", or "rejected". */
        state(): "pending" | "resolved" | "rejected";
    }
    
    /** Read-only view of a JQueryDeferred. */
    interface JQueryPromise<T> {
        done(callback: (...args: any[]) => void): this;
        fail(callback: (...args: any[]) => void): this;
        always(callback: (...args: any[]) => void): this;
        then<R>(onFulfilled?: (...args: any[]) => R | JQueryPromise<R>, onRejected?: (...args: any[]) => any): JQueryPromise<R>;
        promise(target?: any): this;
        state(): "pending" | "resolved" | "rejected";
    }
    
    /**
    * A jQuery object wrapping one or more DOM elements.
    * Available via $j(), jQuery(), or $() in widget client controllers.
    */
    interface JQuery<TElement = HTMLElement> {
        /** Number of elements in the jQuery object. */
        length: number;
        [index: number]: TElement;
    
        // ── Traversal ─────────────────────────────────────────────────────────────
    
        /** Find descendants matching a selector. */
        find(selector: string): JQuery;
        find(element: Element | JQuery): JQuery;
        /** Reduce the set to elements matching a selector or test function. */
        filter(selector: string | ((index: number, element: TElement) => boolean)): JQuery<TElement>;
        /** Remove elements from the set. */
        not(selector: string | Element | JQuery | ((index: number, element: TElement) => boolean)): JQuery<TElement>;
        /** Test whether any element matches a selector. */
        is(selector: string | Element | JQuery | ((index: number, element: TElement) => boolean)): boolean;
        /** Reduce the set to descendants containing a selector or element. */
        has(selector: string | Element): JQuery;
        /** Reduce the set to the element at the given index. */
        eq(index: number): JQuery<TElement>;
        /** Reduce the set to the first element. */
        first(): JQuery<TElement>;
        /** Reduce the set to the last element. */
        last(): JQuery<TElement>;
        /** Get the direct parent(s), optionally filtered by selector. */
        parent(selector?: string): JQuery;
        /** Get all ancestors, optionally filtered by selector. */
        parents(selector?: string): JQuery;
        /** Get ancestors up to (but not including) the matched element. */
        parentsUntil(selector?: string | Element, filter?: string): JQuery;
        /** Get the nearest ancestor matching the selector. */
        closest(selector: string | Element | JQuery): JQuery;
        /** Get direct children, optionally filtered by selector. */
        children(selector?: string): JQuery;
        /** Get siblings, optionally filtered by selector. */
        siblings(selector?: string): JQuery;
        /** Get the immediately following sibling, optionally filtered. */
        next(selector?: string): JQuery;
        /** Get all following siblings, optionally filtered. */
        nextAll(selector?: string): JQuery;
        /** Get elements between this and the next matched element. */
        nextUntil(selector?: string | Element, filter?: string): JQuery;
        /** Get the immediately preceding sibling, optionally filtered. */
        prev(selector?: string): JQuery;
        /** Get all preceding siblings, optionally filtered. */
        prevAll(selector?: string): JQuery;
        /** Get elements between this and the previous matched element. */
        prevUntil(selector?: string | Element, filter?: string): JQuery;
        /** Get child nodes, including text and comment nodes. */
        contents(): JQuery;
        /** Iterate over each element; return false to break early. */
        each(callback: (index: number, element: TElement) => boolean | void): this;
        /** Transform elements, returning a new jQuery object of the results. */
        map<T>(callback: (index: number, element: TElement) => T): JQuery;
        /** Return the underlying elements as a plain array. */
        toArray(): TElement[];
        /** Return all underlying elements (no argument) or a single element by index. */
        get(): TElement[];
        get(index: number): TElement | undefined;
        /** Return the position of an element in the set (or in a selector). */
        index(element?: string | Element | JQuery): number;
        /** Revert to the previous jQuery set (used after filtering). */
        end(): JQuery;
        /** Add the previous set of elements to the current set. */
        addBack(selector?: string): JQuery;
        /** Add elements to the set. */
        add(selector: string | Element | Element[] | JQuery, context?: Element): JQuery;
    
        // ── DOM Manipulation ──────────────────────────────────────────────────────
    
        /** Get or set inner HTML. */
        html(): string;
        html(htmlString: string | ((index: number, oldHtml: string) => string)): this;
        /** Get or set combined text content. */
        text(): string;
        text(text: string | number | boolean | ((index: number, text: string) => string)): this;
        /** Get or set the value of form elements. */
        val(): string | number | string[] | undefined;
        val(value: string | number | string[] | null | ((index: number, value: string) => string)): this;
        /** Get or set an attribute. */
        attr(attributeName: string): string | undefined;
        attr(attributeName: string, value: string | number | null | ((index: number, attr: string) => string | number | null)): this;
        attr(attributes: Record<string, string | number | null>): this;
        /** Remove an attribute. */
        removeAttr(attributeName: string): this;
        /** Get or set a property (e.g. checked, disabled). */
        prop(propertyName: string): any;
        prop(propertyName: string, value: any | ((index: number, oldPropValue: any) => any)): this;
        prop(properties: Record<string, any>): this;
        /** Remove a property. */
        removeProp(propertyName: string): this;
        /** Store or retrieve arbitrary data on elements. */
        data(): Record<string, any>;
        data(key: string): any;
        data(key: string, value: any): this;
        data(obj: Record<string, any>): this;
        /** Remove stored data. */
        removeData(name?: string | string[]): this;
        /** Get or set a CSS property. */
        css(propertyName: string): string;
        css(propertyName: string, value: string | number | ((index: number, value: string) => string | number)): this;
        css(properties: Record<string, string | number | ((index: number, value: string) => string | number)>): this;
        /** Add class name(s). */
        addClass(classNames: string | string[] | ((index: number, currentClass: string) => string)): this;
        /** Remove class name(s). */
        removeClass(classNames?: string | string[] | ((index: number, currentClass: string) => string)): this;
        /** Toggle class name(s); optional state forces add (true) or remove (false). */
        toggleClass(classNames: string | ((index: number, currentClass: string, state?: boolean) => string), state?: boolean): this;
        /** Return true if any element has the given class. */
        hasClass(className: string): boolean;
        /** Insert content at the end of each element. */
        append(content: string | Node | JQuery | Array<string | Node | JQuery>): this;
        /** Insert content at the beginning of each element. */
        prepend(content: string | Node | JQuery | Array<string | Node | JQuery>): this;
        /** Insert each element at the end of the target. */
        appendTo(target: string | Node | JQuery): this;
        /** Insert each element at the beginning of the target. */
        prependTo(target: string | Node | JQuery): this;
        /** Insert content immediately after each element. */
        after(content: string | Node | JQuery | Array<string | Node | JQuery>): this;
        /** Insert content immediately before each element. */
        before(content: string | Node | JQuery | Array<string | Node | JQuery>): this;
        /** Insert each element immediately after the target. */
        insertAfter(target: string | Node | JQuery): this;
        /** Insert each element immediately before the target. */
        insertBefore(target: string | Node | JQuery): this;
        /** Wrap an HTML structure around each element. */
        wrap(wrappingElement: string | Element | JQuery | ((index: number) => string | Element | JQuery)): this;
        /** Wrap an HTML structure around all elements as a single group. */
        wrapAll(wrappingElement: string | Element | JQuery): this;
        /** Wrap an HTML structure around the content of each element. */
        wrapInner(wrappingElement: string | Element | JQuery): this;
        /** Remove the wrapping parent of each element. */
        unwrap(selector?: string): this;
        /** Remove all child nodes and content. */
        empty(): this;
        /** Remove matched elements (and their data/event handlers) from the DOM. */
        remove(selector?: string): this;
        /** Remove elements from the DOM but keep their data and event handlers. */
        detach(selector?: string): this;
        /** Create a deep copy of each matched element. */
        clone(withDataAndEvents?: boolean, deepWithDataAndEvents?: boolean): this;
        /** Replace each element with new content. */
        replaceWith(newContent: string | Element | JQuery | ((index: number) => string | Element | JQuery)): this;
        /** Replace each target element with the matched elements. */
        replaceAll(target: string | Element | JQuery): this;
    
        // ── Dimensions ────────────────────────────────────────────────────────────
    
        /** Get or set the current computed width (excluding padding/border/margin). */
        width(): number | undefined;
        width(value: string | number | ((index: number, width: number) => number | string)): this;
        /** Get or set the current computed height. */
        height(): number | undefined;
        height(value: string | number | ((index: number, height: number) => number | string)): this;
        /** Get the current computed inner width (includes padding, excludes border). */
        innerWidth(): number | undefined;
        /** Get the current computed inner height (includes padding, excludes border). */
        innerHeight(): number | undefined;
        /** Get the current computed outer width (includes padding and border; optionally margin). */
        outerWidth(includeMargin?: boolean): number | undefined;
        /** Get the current computed outer height. */
        outerHeight(includeMargin?: boolean): number | undefined;
        /** Get the current coordinates of the first element relative to the document. */
        offset(): { top: number; left: number } | undefined;
        offset(coordinates: { top?: number; left?: number } | ((index: number, coords: { top: number; left: number }) => { top?: number; left?: number })): this;
        /** Get the position of the first element relative to its offset parent. */
        position(): { top: number; left: number };
        /** Get or set the vertical scroll position. */
        scrollTop(): number | undefined;
        scrollTop(value: number): this;
        /** Get or set the horizontal scroll position. */
        scrollLeft(): number | undefined;
        scrollLeft(value: number): this;
    
        // ── Events ────────────────────────────────────────────────────────────────
    
        /** Attach one or more event handlers. */
        on(events: string, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        on(events: string, data: any, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        on(events: string, selector: string, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        on(events: string, selector: string, data: any, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        on(events: Record<string, (event: JQueryEventObject, ...args: any[]) => any>): this;
        /** Remove event handlers. */
        off(events?: string, selector?: string, handler?: (event: JQueryEventObject) => any): this;
        off(events: Record<string, (event: JQueryEventObject) => any>): this;
        /** Attach a one-time event handler. */
        one(events: string, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        one(events: string, selector: string, handler: (event: JQueryEventObject, ...args: any[]) => any): this;
        /** Execute handlers and trigger the named event. */
        trigger(eventType: string | JQueryEventObject, extraParameters?: any[] | any): this;
        /** Execute handlers without triggering the native browser event. */
        triggerHandler(eventType: string | JQueryEventObject, extraParameters?: any[] | any): any;
        /** Attach a click handler, or trigger a click. */
        click(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a dblclick handler, or trigger. */
        dblclick(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a focus handler, or trigger. */
        focus(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a blur handler, or trigger. */
        blur(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a change handler, or trigger. */
        change(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a submit handler, or trigger. */
        submit(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a keydown handler, or trigger. */
        keydown(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a keyup handler, or trigger. */
        keyup(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a keypress handler, or trigger. */
        keypress(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mouseenter handler. */
        mouseenter(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mouseleave handler. */
        mouseleave(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mouseover handler. */
        mouseover(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mouseout handler. */
        mouseout(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mousemove handler. */
        mousemove(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mousedown handler. */
        mousedown(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a mouseup handler. */
        mouseup(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a resize handler. */
        resize(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a scroll handler. */
        scroll(handler?: (event: JQueryEventObject) => any): this;
        /** Attach a select handler. */
        select(handler?: (event: JQueryEventObject) => any): this;
        /** Bind mouseenter and mouseleave handlers. */
        hover(handlerIn: (event: JQueryEventObject) => any, handlerOut?: (event: JQueryEventObject) => any): this;
    
        // ── Effects ───────────────────────────────────────────────────────────────
    
        /** Display matched elements. */
        show(duration?: string | number, easing?: string, complete?: () => void): this;
        show(options: Record<string, any>): this;
        /** Hide matched elements. */
        hide(duration?: string | number, easing?: string, complete?: () => void): this;
        hide(options: Record<string, any>): this;
        /** Show or hide matched elements. */
        toggle(showOrHide?: boolean): this;
        toggle(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Fade in matched elements. */
        fadeIn(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Fade out matched elements. */
        fadeOut(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Adjust the opacity of matched elements. */
        fadeTo(duration: string | number, opacity: number, easing?: string, complete?: () => void): this;
        /** Toggle the fade state of matched elements. */
        fadeToggle(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Display matched elements with a sliding motion downward. */
        slideDown(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Hide matched elements with a sliding motion upward. */
        slideUp(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Toggle the slide state of matched elements. */
        slideToggle(duration?: string | number, easing?: string, complete?: () => void): this;
        /** Perform a custom animation on CSS properties. */
        animate(properties: Record<string, any>, duration?: string | number, easing?: string, complete?: () => void): this;
        animate(properties: Record<string, any>, options: Record<string, any>): this;
        /** Stop running animations on matched elements. */
        stop(clearQueue?: boolean, jumpToEnd?: boolean): this;
        stop(queue: string, clearQueue?: boolean, jumpToEnd?: boolean): this;
        /** Set a timer to delay execution of subsequent queue items. */
        delay(duration: number, queueName?: string): this;
        /** Execute the next function in the queue. */
        dequeue(queueName?: string): this;
        /** Get or set the queue of functions to be executed on the matched elements. */
        queue(queueName?: string): Function[];
        queue(queueName: string, newQueue: Function[] | ((next: () => void) => void)): this;
        /** Remove all queued functions not yet executed. */
        clearQueue(queueName?: string): this;
        /** Stop the currently-running animation and clear remaining queue items. */
        finish(queue?: string): this;
    
        // ── Misc ──────────────────────────────────────────────────────────────────
    
        /** Specify a function to execute when the DOM is ready. */
        ready(handler: (jq: JQueryStatic) => void): this;
        /** Return a Promise-like object that resolves when all animations complete. */
        promise(type?: string, target?: any): JQueryPromise<any>;
        /** Encode a set of form elements as a string for submission. */
        serialize(): string;
        /** Encode a set of form elements as an array of names and values. */
        serializeArray(): Array<{ name: string; value: string }>;
    }
    
    /** The jQuery function and namespace (available as $j, jQuery, and $ in SP widgets). */
    interface JQueryStatic {
        /** Wrap DOM elements or create new ones from an HTML string. */
        (selector: string, context?: string | Element | JQuery | Document): JQuery;
        (element: Element | Element[] | Document | Window): JQuery;
        (jq: JQuery): JQuery;
        (callback: (this: Document, jq: JQueryStatic) => void): JQuery<Document>;
        (object: {}): JQuery;
        (): JQuery;
    
        // ── Ajax ──────────────────────────────────────────────────────────────────
    
        /** Perform an asynchronous HTTP (Ajax) request. */
        ajax(url: string, settings?: JQueryAjaxSettings): JQueryXHR;
        ajax(settings?: JQueryAjaxSettings): JQueryXHR;
        /** Load data from the server using an HTTP GET request. */
        get(url: string, data?: any, success?: (data: any, textStatus: string, jqXHR: JQueryXHR) => void, dataType?: string): JQueryXHR;
        /** Send data to the server using an HTTP POST request. */
        post(url: string, data?: any, success?: (data: any, textStatus: string, jqXHR: JQueryXHR) => void, dataType?: string): JQueryXHR;
        /** Load JSON-encoded data from the server using an HTTP GET request. */
        getJSON(url: string, data?: any, success?: (data: any, textStatus: string, jqXHR: JQueryXHR) => void): JQueryXHR;
        /** Load and execute a JavaScript file from the server using an HTTP GET request. */
        getScript(url: string, success?: (script: string, textStatus: string, jqXHR: JQueryXHR) => void): JQueryXHR;
        /** Set default values for future Ajax requests. */
        ajaxSetup(options: JQueryAjaxSettings): void;
    
        // ── Utilities ─────────────────────────────────────────────────────────────
    
        /** Merge objects; first argument is modified and returned. */
        extend(target: any, ...objects: any[]): any;
        extend(deep: boolean, target: any, ...objects: any[]): any;
        /** Iterate over an array or object. */
        each<T>(collection: T[], callback: (index: number, value: T) => boolean | void): T[];
        each<T extends Record<string, any>>(collection: T, callback: (key: string, value: any) => boolean | void): T;
        /** Translate all items in an array or object to a new array of items. */
        map<T, R>(array: T[], callback: (value: T, index: number) => R | null | undefined): R[];
        /** Filter array elements by a test function. */
        grep<T>(array: T[], func: (element: T, index: number) => boolean, invert?: boolean): T[];
        /** Search for a value within an array; returns its index or -1. */
        inArray<T>(value: T, array: T[], fromIndex?: number): number;
        /** Merge the contents of two arrays together into the first array. */
        merge<T>(first: T[], second: ArrayLike<T>): T[];
        /** Remove duplicate elements from an array. */
        uniqueSort(arr: any[]): any[];
        /** Determine if the argument is an Array. */
        isArray(obj: any): obj is any[];
        /** Determine if the argument is callable. */
        isFunction(obj: any): obj is Function;
        /** Determine if the argument has no enumerable own-properties. */
        isEmptyObject(obj: any): boolean;
        /** Determine if the argument was created by the Object constructor. */
        isPlainObject(obj: any): boolean;
        /** Determine whether the argument is a number or a numeric string. */
        isNumeric(value: any): boolean;
        /** Determine the internal JavaScript [[Class]] of an object. */
        type(obj: any): string;
        /** Remove whitespace from the beginning and end of a string. */
        trim(str: string): string;
        /** Parse a JSON string. */
        parseJSON(json: string): any;
        /** Parse a string into an XML document. */
        parseXML(data: string): Document;
        /** Create a serialized representation of an array, a plain object, or a jQuery object. */
        param(obj: any, traditional?: boolean): string;
        /** Create a new function that, when called, has a given context. */
        proxy(fn: (...args: any[]) => any, context: any, ...args: any[]): (...args: any[]) => any;
        proxy(context: any, name: string, ...args: any[]): (...args: any[]) => any;
        /** A no-op function. */
        noop(): void;
        /** Return a number representing the current time (milliseconds since epoch). */
        now(): number;
        /** Escape special characters in a string for use in a jQuery selector. */
        escapeSelector(selector: string): string;
    
        // ── Deferred ──────────────────────────────────────────────────────────────
    
        /** Create a new Deferred object. */
        Deferred<T = any>(beforeStart?: (deferred: JQueryDeferred<T>) => void): JQueryDeferred<T>;
        /** Provides a way to execute callback functions based on zero or more Deferred objects. */
        when<T>(...deferreds: Array<JQueryPromise<any> | T>): JQueryPromise<T>;
    
        // ── Properties ────────────────────────────────────────────────────────────
    
        /** Exposes the jQuery prototype for plugin authoring. */
        fn: JQuery & { extend(obj: any): JQuery };
        /** jQuery version string. */
        jquery: string;
        /** Browser support flags. */
        support: Record<string, any>;
        /** Expression filters and custom selectors. */
        expr: Record<string, any>;
        /** Global Ajax event settings. */
        event: Record<string, any>;
    }
    
    /**
     * Wrap elements or register a DOMContentLoaded callback.
     * ServiceNow loads jQuery as both \`$\` and \`$j\` in Service Portal.
     */
    declare var $: JQueryStatic;
    /** ServiceNow's jQuery alias (always present in classic UI and Service Portal). */
    declare var $j: JQueryStatic;
    /** Standard jQuery global. */
    declare var jQuery: JQueryStatic;

    ///////////////////////////////////////////////////////////////
    // JQLite
    // @see {@link https://docs.angularjs.org/api/ng/function/angular.element}
    ///////////////////////////////////////////////////////////////

    /** CSS property setter function used in \`.css(properties)\` overloads. */
    interface cssPropertySetter {
        (index: number, value?: string): string | number;
    }

    /** Map of CSS property names to values or setter functions, used by \`.css()\`. */
    interface JQLiteCssProperties {
        [propertyName: string]: string | number | cssPropertySetter;
    }

    /**
     * AngularJS jqLite element — a jQuery-compatible wrapper returned by \`angular.element()\`
     * and passed as \`$element\` in directive link functions and controllers.
     * @see {@link https://docs.angularjs.org/api/ng/function/angular.element}
     */
    interface JQLite extends JQuery<HTMLElement> {
        [index: number]: HTMLElement;

        /** Returns the controller of the current element or its parents. */
        controller(name?: string): any;

        /** Returns the \`$injector\` of the current element. */
        injector(): angular.auto.IInjectorService;

        /**
         * Returns the \`$scope\` of the element.
         * **IMPORTANT**: Requires \`debugInfoEnabled\` to be true.
         * @see {@link https://docs.angularjs.org/guide/production#disabling-debug-data}
         */
        scope<T extends angular.IScope>(): T;

        /**
         * Returns the isolate \`$scope\` of the element.
         * **IMPORTANT**: Requires \`debugInfoEnabled\` to be true.
         * @see {@link https://docs.angularjs.org/guide/production#disabling-debug-data}
         */
        isolateScope<T extends angular.IScope>(): T;

        /** Get or set data on the element and its ancestor chain. */
        inheritedData(key: string, value: any): this;
        inheritedData(obj: { [key: string]: any }): this;
        inheritedData(key?: string): any;
    }
`;

    // buildApiDts() generates 'declare var api' from parsed controller params, typed via DI_TYPES.

    // DI token → TypeScript type name, matching the declarations in the DTS above.
    var DI_TYPES = {
        $scope: 'angular.IScope',
        $rootScope: 'angular.IRootScopeService',
        $http: 'angular.IHttpService',
        $q: 'angular.IQService',
        $timeout: 'angular.ITimeoutService',
        $interval: 'angular.IIntervalService',
        $location: 'angular.ILocationService',
        $filter: 'angular.IFilterService',
        $log: 'angular.ILogService',
        $window: 'Window & typeof globalThis',
        $document: 'JQLite',
        $element: 'JQLite',
        $attrs: 'angular.IAttributes',
        $sce: 'angular.ISCEService',
        $animate: 'angular.IAnimateService',
        $anchorScroll: 'angular.IAnchorScrollService',
        $cacheFactory: 'angular.ICacheFactoryService',
        $compile: 'angular.ICompileService',
        $controller: 'angular.IControllerService',
        $exceptionHandler: 'angular.IExceptionHandlerService',
        $interpolate: 'angular.IInterpolateService',
        $parse: 'angular.IParseService',
        $templateCache: 'angular.ITemplateCacheService',
        $uibModal: 'SpModal',
        spUtil: 'SpUtil',
        spModal: 'SpModal',
        snRecordWatcher: 'SnRecordWatcher',
        cabrillo: 'Cabrillo',
        i18n: 'I18n',
        spAriaUtil: 'SpAriaUtil',
        spNavServiceClient: 'SpNavServiceClient',
        data: '{ [key: string]: any }',
        options: '{ [key: string]: any }',
    };

    // Signature used until a controller parameter list has been parsed.
    var DEFAULT_CONTROLLER_PARAMS = [
        '$scope',
        'spUtil',
        'spModal',
        '$http',
        '$q',
        '$timeout',
        '$location',
        '$rootScope',
        '$element',
        '$window',
    ];

    /** True when the name is a valid TS identifier we can emit as a parameter. */
    function _isValidParamName(name) {
        return /^[A-Za-z_$][\w$]*$/.test(name);
    }

    /**
     * Build the 'declare var api' ambient declaration.
     *
     * @param {string[]} [controllerParams] - Parameter names in the order the
     *   developer wrote them. Falls back to DEFAULT_CONTROLLER_PARAMS.
     * @returns {string} d.ts source for the api object.
     */
    function buildApiDts(controllerParams) {
        var params = controllerParams && controllerParams.length ? controllerParams : DEFAULT_CONTROLLER_PARAMS;

        var lines = [
            '/**',
            ' * Service Portal widget component API object.',
            ' *',
            ' * Assign api.controller inside the client controller field. AngularJS',
            ' * injects services by parameter name, in any order. This signature is',
            ' * regenerated automatically to match the parameter list in the editor.',
            ' */',
            'declare var api: {',
            '    /**',
            '     * Widget controller function. AngularJS injects services by parameter name.',
            '     * @see {@link https://docs.angularjs.org/guide/di}',
            '     */',
            '    controller: (',
        ];

        params.forEach(function (name) {
            if (!_isValidParamName(name)) {
                return;
            }
            var type = DI_TYPES[name] || 'any';
            lines.push('        ' + name + ': ' + type + ',');
        });

        lines.push(
            '        ...rest: any[]',
            '    ) => void;',
            '    /**',
            '     * Widget link function for direct DOM manipulation. Runs after the',
            '     * template is compiled. Arguments are positional: scope, element, attrs.',
            '     * @see {@link https://docs.angularjs.org/api/ng/service/$compile#-link-}',
            '     */',
            '    link: (',
            '        scope: angular.IScope,',
            '        element: JQLite,',
            '        attrs: angular.IAttributes,',
            '        ...rest: any[]',
            '    ) => void;',
            '};'
        );

        return lines.join('\n');
    }

    window.MONACO_LANGUAGE_CLIENT_DI = {
        types: DI_TYPES,
        defaultParams: DEFAULT_CONTROLLER_PARAMS,
        buildApiDts: buildApiDts,
    };
})();
