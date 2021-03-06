import React, { PropTypes } from 'react';
import ReactDOM from 'react-dom';
import DOMScroller from 'zscroller';
import assign from 'object-assign';
import classNames from 'classnames';
import { throttle } from './util';

const SCROLLVIEW = 'ScrollView';
const INNERVIEW = 'InnerScrollView';

// https://github.com/facebook/react-native/blob/master/Libraries/Components/ScrollView/ScrollView.js
// https://facebook.github.io/react-native/docs/refreshcontrol.html

/* eslint react/prop-types: 0, react/sort-comp: 0, no-unused-expressions: 0 */

const propTypes = {
  children: PropTypes.any,
  className: PropTypes.string,
  prefixCls: PropTypes.string,
  listPrefixCls: PropTypes.string,
  listViewPrefixCls: PropTypes.string,
  style: PropTypes.object,
  contentContainerStyle: PropTypes.object,
  onScroll: PropTypes.func,
  scrollEventThrottle: PropTypes.number,
  removeClippedSubviews: PropTypes.bool, // offscreen views are removed
  refreshControl: PropTypes.element,
};
const styles = {
  base: {
    position: 'relative',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    flex: 1,
  },
  zScroller: {
    position: 'relative',
    overflow: 'hidden',
    flex: 1,
  },
};

export default class ScrollView extends React.Component {
  static propTypes = propTypes;

  componentDidUpdate(prevProps) {
    if (prevProps.refreshControl && this.props.refreshControl) {
      const preRefreshing = prevProps.refreshControl.props.refreshing;
      const nowRefreshing = this.props.refreshControl.props.refreshing;
      if (preRefreshing && !nowRefreshing && this.refreshControlRefresh) {
        this.refreshControlRefresh();
      } else if (!this.manuallyRefresh && !preRefreshing && nowRefreshing) {
        this.domScroller.scroller.triggerPullToRefresh();
      }
    }
  }
  componentDidMount() {
    this.tsExec = this.throttleScroll();
    // IE supports onresize on all HTML elements.
    // In all other Browsers the onresize is only available at the window object
    this.onLayout = () => this.props.onLayout({
      nativeEvent: { layout: { width: window.innerWidth, height: window.innerHeight } },
    });
    const ele = ReactDOM.findDOMNode(this.refs[SCROLLVIEW]);

    if (this.props.stickyHeader || this.props.useBodyScroll) {
      window.addEventListener('scroll', this.tsExec);
      window.addEventListener('resize', this.onLayout);
      // todo
      // ele.addEventListener('resize', this.onContentSizeChange);
    } else {
      // todo
      // ele.addEventListener('resize', this.onLayout);
      // ReactDOM.findDOMNode(this.refs[INNERVIEW])
      // .addEventListener('resize', this.onContentSizeChange);
      if (this.props.useZscroller) {
        this.renderZscroller();
      } else {
        ele.addEventListener('scroll', this.tsExec);
      }
    }
  }
  componentWillUnmount() {
    if (this.props.stickyHeader || this.props.useBodyScroll) {
      window.removeEventListener('scroll', this.tsExec);
      window.removeEventListener('resize', this.onLayout);
    } else if (this.props.useZscroller) {
      this.domScroller.destroy();
    } else {
      ReactDOM.findDOMNode(this.refs[SCROLLVIEW]).removeEventListener('scroll', this.tsExec);
    }
  }
  scrollTo(...args) {
    if (this.props.stickyHeader || this.props.useBodyScroll) {
      window.scrollTo(...args);
    } else if (this.props.useZscroller) {
      this.domScroller.scroller.scrollTo(...args);
    } else {
      const ele = ReactDOM.findDOMNode(this.refs[SCROLLVIEW]);
      ele.scrollLeft = args[0];
      ele.scrollTop = args[1];
    }
  }

  throttleScroll = () => {
    let handleScroll = () => {};
    if (this.props.scrollEventThrottle && this.props.onScroll) {
      handleScroll = throttle(e => {
        this.props.onScroll && this.props.onScroll(e);
      }, this.props.scrollEventThrottle);
    }
    return handleScroll;
  }

  renderZscroller() {
    const { scrollerOptions, refreshControl } = this.props;

    this.domScroller = new DOMScroller(ReactDOM.findDOMNode(this.refs[INNERVIEW]), assign({}, {
      scrollingX: false,
      onScroll: this.tsExec,
    }, scrollerOptions));
    if (refreshControl) {
      const scroller = this.domScroller.scroller;
      const { distanceToRefresh, onRefresh } = refreshControl.props;
      scroller.activatePullToRefresh(distanceToRefresh,
        () => {
          this.manuallyRefresh = true;
          this.refs.refreshControl.setState({ active: true });
        },
        () => {
          this.manuallyRefresh = false;
          this.refs.refreshControl.setState({ active: false, loadingState: false });
        },
        () => {
          this.refs.refreshControl.setState({ loadingState: true });
          const finishPullToRefresh = () => {
            scroller.finishPullToRefresh();
            this.refreshControlRefresh = null;
          };
          Promise.all([
            new Promise(resolve => {
              onRefresh();
              this.refreshControlRefresh = resolve;
            }),
            // at lease 1s for ux
            new Promise(resolve => setTimeout(resolve, 1000)),
          ]).then(finishPullToRefresh, finishPullToRefresh);
        });
      if (refreshControl.props.refreshing) {
        scroller.triggerPullToRefresh();
      }
    }
  }
  render() {
    const {
      children, className, prefixCls = '', listPrefixCls = '', listViewPrefixCls = 'rmc-list-view',
      style = {}, contentContainerStyle,
      useZscroller, refreshControl, stickyHeader, useBodyScroll,
    } = this.props;

    let styleBase = styles.base;
    if (stickyHeader || useBodyScroll) {
      styleBase = null;
    } else if (useZscroller) {
      styleBase = styles.zScroller;
    }

    const preCls = prefixCls || listViewPrefixCls || '';

    const containerProps = {
      ref: SCROLLVIEW,
      style: assign({}, styleBase, style),
      className: classNames({
        [className]: !!className,
        [`${preCls}-scrollview`]: true,
      }),
    };
    const contentContainerProps = {
      ref: INNERVIEW,
      style: assign({}, { position: 'absolute', minWidth: '100%' }, contentContainerStyle),
      className: classNames({
        [`${preCls}-scrollview-content`]: true,
        [listPrefixCls]: !!listPrefixCls,
      }),
    };

    if (refreshControl) {
      return (
        <div {...containerProps}>
          <div {...contentContainerProps}>
            {React.cloneElement(refreshControl, { ref: 'refreshControl' })}
            {children}
          </div>
        </div>
      );
    }

    if (stickyHeader || useBodyScroll) {
      return (
        <div {...containerProps}>
          {children}
        </div>
      );
    }
    return (
      <div {...containerProps}>
        <div {...contentContainerProps}>{children}</div>
      </div>
    );
  }
}
