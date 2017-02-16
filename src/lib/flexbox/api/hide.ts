/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {
  Directive,
  ElementRef,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  Renderer,
  SimpleChanges,
  Self,
  Optional, Inject
} from '@angular/core';

import {Subscription} from 'rxjs/Subscription';
import 'rxjs/add/operator/filter';

import {BaseFxDirective} from './base';
import {MediaChange} from '../../media-query/media-change';
import {MediaMonitor} from '../../media-query/media-monitor';

import {EventBusService, EventBusFilter} from '../../utils/event-bus-service';
import {ShowHideConnector, ConnectorEvents} from '../utils/show-hide-connector';

import {LayoutDirective} from './layout';

/**
 * 'show' Layout API directive
 *
 */
@Directive({
  selector: `
  [fxHide],
  [fxHide.xs],
  [fxHide.gt-xs],
  [fxHide.sm],
  [fxHide.gt-sm],
  [fxHide.md],
  [fxHide.gt-md],
  [fxHide.lg],
  [fxHide.gt-lg],
  [fxHide.xl]
`
})
export class HideDirective extends BaseFxDirective implements OnInit, OnChanges, OnDestroy {

  /**
   * Subscription to the parent flex container's layout changes.
   * Stored so we can unsubscribe when this directive is destroyed.
   */
  protected _layoutWatcher: Subscription;

  protected _connectorWatcher: Subscription;

  @Input('fxHide')       set hide(val) {
    this._cacheInput("hide", val);
  }

  @Input('fxHide.xs')    set hideXs(val) {
    this._cacheInput('hideXs', val);
  }

  @Input('fxHide.gt-xs') set hideGtXs(val) {
    this._cacheInput('hideGtXs', val);
  };

  @Input('fxHide.sm')    set hideSm(val) {
    this._cacheInput('hideSm', val);
  };

  @Input('fxHide.gt-sm') set hideGtSm(val) {
    this._cacheInput('hideGtSm', val);
  };

  @Input('fxHide.md')    set hideMd(val) {
    this._cacheInput('hideMd', val);
  };

  @Input('fxHide.gt-md') set hideGtMd(val) {
    this._cacheInput('hideGtMd', val);
  };

  @Input('fxHide.lg')    set hideLg(val) {
    this._cacheInput('hideLg', val);
  };

  @Input('fxHide.gt-lg') set hideGtLg(val) {
    this._cacheInput('hideGtLg', val);
  };

  @Input('fxHide.xl')    set hideXl(val) {
    this._cacheInput('hideXl', val);
  };

  /**
   *
   */
  constructor(monitor: MediaMonitor,
              elRef: ElementRef,
              renderer: Renderer,
              @Inject(ShowHideConnector) protected _connector: EventBusService,
              @Optional() @Self() protected _layout: LayoutDirective) {

    super(monitor, elRef, renderer);

    /**
     * The Layout can set the display:flex (and incorrectly affect the Hide/Show directives.
     * Whenever Layout [on the same element] resets its CSS, then update the Hide/Show CSS
     */
    if (_layout) {
      this._layoutWatcher = _layout.layout$.subscribe(() => this._updateWithValue());
    }
    this._display = this._getDisplayStyle(); // re-invoke override to use `this._layout`

  }


  // *********************************************
  // Lifecycle Methods
  // *********************************************

  /**
   * Override accessor to the current HTMLElement's `display` style
   * Note: Show/Hide will not change the display to 'flex' but will set it to 'block'
   * unless it was already explicitly defined.
   */
  protected _getDisplayStyle(): string {
    return this._layout ? "flex" : super._getDisplayStyle();
  }

  /**
   * On changes to any @Input properties...
   * Default to use the non-responsive Input value ('fxHide')
   * Then conditionally override with the mq-activated Input's current value
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['hide'] != null || this._mqActivation) {
      this._updateWithValue();
    }
  }

  /**
   * After the initial onChanges, build a mqActivation object that bridges
   * mql change events to onMediaQueryChange handlers
   * NOTE: fxHide has special fallback defaults.
   *       - If the non-responsive fxHide="" is specified we default to hide==true
   *       - If the non-responsive fxHide is NOT specified, use default hide == false
   *       This logic supports mixed usages with fxShow; e.g. `<div fxHide fxShow.gt-sm>`
   */
  ngOnInit() {
    this._activateReponsive();
    this._activateConnector();

    if (!this._delegateToHide()) {
      this._updateWithValue();
    }
  }


  ngOnDestroy() {
    super.ngOnDestroy();
    if (this._layoutWatcher) {
      this._layoutWatcher.unsubscribe();
    }
    if (this._connectorWatcher) {
      this._connectorWatcher.unsubscribe();
    }
  }

  // *********************************************
  // Protected methods
  // *********************************************

  /**
   *  Activate the Responsive features using MediaMonitor
   *  and delegating via the ShowHideConnector if needed.
   */
  protected _activateReponsive() {
    // If the attribute 'fxHide' is specified we default to hide==true, otherwise do nothing..
    let value = (this._queryInput('hide') == "") ? true : this._getDefaultVal("hide", false);

    /**
     * Listen for responsive changes
     */
    this._listenForMediaQueryChanges('hide', value, (changes: MediaChange) => {
      this._updateWithValue(changes.value);
    });
  }

  /**
   * Use special ShowHideConnector message-bus to listen
   * for incoming updateWithHide messages and trigger
   * `updateWithValue()`.
   *
   *  NOTE: ShowHideConnector supports messaging ONLY for
   *  directives on the same element.
   */
  protected _activateConnector() {
    let isSameElement: EventBusFilter = ((el: any) => (el === this.nativeElement));
    this._connectorWatcher = this._connector
        .observe(ConnectorEvents.announceHasShow)
        .filter(isSameElement)
        .subscribe(() => {
          this._hasShow = true;
          console.log('ConnectorEvents.announceHasShow');
          this._connectorWatcher.unsubscribe();
        });
    // console.log('hide::  ' + this.nativeElement);
    this._connector.emit(ConnectorEvents.announceHasHide, this.nativeElement);

  }

  /**
   * If deactivating Show, then delegate action to the Hide directive if it is
   * specified on same element.
   */
  protected _delegateToHide(changes?: MediaChange) {
    let delegate = (!changes || !this.hasKeyValue('hide'));
    return delegate && this._hasShow;
  }

  /**
   * Validate the visibility value and then update the host's inline display style
   */
  protected _updateWithValue(value?: string|number|boolean) {
    value = value || this._getDefaultVal("hide", false);
    if (this._mqActivation) {
      value = this._mqActivation.activatedInput;
    }

    let shouldHide = this._validateTruthy(value);
    this._applyStyleToElement(this._buildCSS(shouldHide));
  }


  /**
   * Build the CSS that should be assigned to the element instance
   */
  protected _buildCSS(value) {
    return {'display': value ? 'none' : this._display};
  }

  /**
   * Validate the value to NOT be FALSY
   */
  protected _validateTruthy(value) {
    return FALSY.indexOf(value) === -1;
  }

  /**
   * Does this element also have fxShow directives?
   */
  private _hasShow = false;
}


const FALSY = ['false', false, 0];

