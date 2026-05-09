(() => {
  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p;
  var v;
  var y;
  var d = {};
  var w = [];
  var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var g = Array.isArray;
  function m(n4, l5) {
    for (var u4 in l5) n4[u4] = l5[u4];
    return n4;
  }
  function b(n4) {
    n4 && n4.parentNode && n4.parentNode.removeChild(n4);
  }
  function k(l5, u4, t5) {
    var i4, r4, o4, e4 = {};
    for (o4 in u4) "key" == o4 ? i4 = u4[o4] : "ref" == o4 ? r4 = u4[o4] : e4[o4] = u4[o4];
    if (arguments.length > 2 && (e4.children = arguments.length > 3 ? n.call(arguments, 2) : t5), "function" == typeof l5 && null != l5.defaultProps) for (o4 in l5.defaultProps) void 0 === e4[o4] && (e4[o4] = l5.defaultProps[o4]);
    return x(l5, e4, i4, r4, null);
  }
  function x(n4, t5, i4, r4, o4) {
    var e4 = { type: n4, props: t5, key: i4, ref: r4, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o4 ? ++u : o4, __i: -1, __u: 0 };
    return null == o4 && null != l.vnode && l.vnode(e4), e4;
  }
  function S(n4) {
    return n4.children;
  }
  function C(n4, l5) {
    this.props = n4, this.context = l5;
  }
  function $(n4, l5) {
    if (null == l5) return n4.__ ? $(n4.__, n4.__i + 1) : null;
    for (var u4; l5 < n4.__k.length; l5++) if (null != (u4 = n4.__k[l5]) && null != u4.__e) return u4.__e;
    return "function" == typeof n4.type ? $(n4) : null;
  }
  function I(n4) {
    if (n4.__P && n4.__d) {
      var u4 = n4.__v, t5 = u4.__e, i4 = [], r4 = [], o4 = m({}, u4);
      o4.__v = u4.__v + 1, l.vnode && l.vnode(o4), q(n4.__P, o4, u4, n4.__n, n4.__P.namespaceURI, 32 & u4.__u ? [t5] : null, i4, null == t5 ? $(u4) : t5, !!(32 & u4.__u), r4), o4.__v = u4.__v, o4.__.__k[o4.__i] = o4, D(i4, o4, r4), u4.__e = u4.__ = null, o4.__e != t5 && P(o4);
    }
  }
  function P(n4) {
    if (null != (n4 = n4.__) && null != n4.__c) return n4.__e = n4.__c.base = null, n4.__k.some(function(l5) {
      if (null != l5 && null != l5.__e) return n4.__e = n4.__c.base = l5.__e;
    }), P(n4);
  }
  function A(n4) {
    (!n4.__d && (n4.__d = true) && i.push(n4) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
  }
  function H() {
    try {
      for (var n4, l5 = 1; i.length; ) i.length > l5 && i.sort(e), n4 = i.shift(), l5 = i.length, I(n4);
    } finally {
      i.length = H.__r = 0;
    }
  }
  function L(n4, l5, u4, t5, i4, r4, o4, e4, f4, c4, s4) {
    var a4, h5, p5, v4, y5, _5, g4, m5 = t5 && t5.__k || w, b4 = l5.length;
    for (f4 = T(u4, l5, m5, f4, b4), a4 = 0; a4 < b4; a4++) null != (p5 = u4.__k[a4]) && (h5 = -1 != p5.__i && m5[p5.__i] || d, p5.__i = a4, _5 = q(n4, p5, h5, i4, r4, o4, e4, f4, c4, s4), v4 = p5.__e, p5.ref && h5.ref != p5.ref && (h5.ref && J(h5.ref, null, p5), s4.push(p5.ref, p5.__c || v4, p5)), null == y5 && null != v4 && (y5 = v4), (g4 = !!(4 & p5.__u)) || h5.__k === p5.__k ? (f4 = j(p5, f4, n4, g4), g4 && h5.__e && (h5.__e = null)) : "function" == typeof p5.type && void 0 !== _5 ? f4 = _5 : v4 && (f4 = v4.nextSibling), p5.__u &= -7);
    return u4.__e = y5, f4;
  }
  function T(n4, l5, u4, t5, i4) {
    var r4, o4, e4, f4, c4, s4 = u4.length, a4 = s4, h5 = 0;
    for (n4.__k = new Array(i4), r4 = 0; r4 < i4; r4++) null != (o4 = l5[r4]) && "boolean" != typeof o4 && "function" != typeof o4 ? ("string" == typeof o4 || "number" == typeof o4 || "bigint" == typeof o4 || o4.constructor == String ? o4 = n4.__k[r4] = x(null, o4, null, null, null) : g(o4) ? o4 = n4.__k[r4] = x(S, { children: o4 }, null, null, null) : void 0 === o4.constructor && o4.__b > 0 ? o4 = n4.__k[r4] = x(o4.type, o4.props, o4.key, o4.ref ? o4.ref : null, o4.__v) : n4.__k[r4] = o4, f4 = r4 + h5, o4.__ = n4, o4.__b = n4.__b + 1, e4 = null, -1 != (c4 = o4.__i = O(o4, u4, f4, a4)) && (a4--, (e4 = u4[c4]) && (e4.__u |= 2)), null == e4 || null == e4.__v ? (-1 == c4 && (i4 > s4 ? h5-- : i4 < s4 && h5++), "function" != typeof o4.type && (o4.__u |= 4)) : c4 != f4 && (c4 == f4 - 1 ? h5-- : c4 == f4 + 1 ? h5++ : (c4 > f4 ? h5-- : h5++, o4.__u |= 4))) : n4.__k[r4] = null;
    if (a4) for (r4 = 0; r4 < s4; r4++) null != (e4 = u4[r4]) && 0 == (2 & e4.__u) && (e4.__e == t5 && (t5 = $(e4)), K(e4, e4));
    return t5;
  }
  function j(n4, l5, u4, t5) {
    var i4, r4;
    if ("function" == typeof n4.type) {
      for (i4 = n4.__k, r4 = 0; i4 && r4 < i4.length; r4++) i4[r4] && (i4[r4].__ = n4, l5 = j(i4[r4], l5, u4, t5));
      return l5;
    }
    n4.__e != l5 && (t5 && (l5 && n4.type && !l5.parentNode && (l5 = $(n4)), u4.insertBefore(n4.__e, l5 || null)), l5 = n4.__e);
    do {
      l5 = l5 && l5.nextSibling;
    } while (null != l5 && 8 == l5.nodeType);
    return l5;
  }
  function O(n4, l5, u4, t5) {
    var i4, r4, o4, e4 = n4.key, f4 = n4.type, c4 = l5[u4], s4 = null != c4 && 0 == (2 & c4.__u);
    if (null === c4 && null == e4 || s4 && e4 == c4.key && f4 == c4.type) return u4;
    if (t5 > (s4 ? 1 : 0)) {
      for (i4 = u4 - 1, r4 = u4 + 1; i4 >= 0 || r4 < l5.length; ) if (null != (c4 = l5[o4 = i4 >= 0 ? i4-- : r4++]) && 0 == (2 & c4.__u) && e4 == c4.key && f4 == c4.type) return o4;
    }
    return -1;
  }
  function z(n4, l5, u4) {
    "-" == l5[0] ? n4.setProperty(l5, null == u4 ? "" : u4) : n4[l5] = null == u4 ? "" : "number" != typeof u4 || _.test(l5) ? u4 : u4 + "px";
  }
  function N(n4, l5, u4, t5, i4) {
    var r4, o4;
    n: if ("style" == l5) if ("string" == typeof u4) n4.style.cssText = u4;
    else {
      if ("string" == typeof t5 && (n4.style.cssText = t5 = ""), t5) for (l5 in t5) u4 && l5 in u4 || z(n4.style, l5, "");
      if (u4) for (l5 in u4) t5 && u4[l5] == t5[l5] || z(n4.style, l5, u4[l5]);
    }
    else if ("o" == l5[0] && "n" == l5[1]) r4 = l5 != (l5 = l5.replace(a, "$1")), o4 = l5.toLowerCase(), l5 = o4 in n4 || "onFocusOut" == l5 || "onFocusIn" == l5 ? o4.slice(2) : l5.slice(2), n4.l || (n4.l = {}), n4.l[l5 + r4] = u4, u4 ? t5 ? u4[s] = t5[s] : (u4[s] = h, n4.addEventListener(l5, r4 ? v : p, r4)) : n4.removeEventListener(l5, r4 ? v : p, r4);
    else {
      if ("http://www.w3.org/2000/svg" == i4) l5 = l5.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l5 && "height" != l5 && "href" != l5 && "list" != l5 && "form" != l5 && "tabIndex" != l5 && "download" != l5 && "rowSpan" != l5 && "colSpan" != l5 && "role" != l5 && "popover" != l5 && l5 in n4) try {
        n4[l5] = null == u4 ? "" : u4;
        break n;
      } catch (n5) {
      }
      "function" == typeof u4 || (null == u4 || false === u4 && "-" != l5[4] ? n4.removeAttribute(l5) : n4.setAttribute(l5, "popover" == l5 && 1 == u4 ? "" : u4));
    }
  }
  function V(n4) {
    return function(u4) {
      if (this.l) {
        var t5 = this.l[u4.type + n4];
        if (null == u4[c]) u4[c] = h++;
        else if (u4[c] < t5[s]) return;
        return t5(l.event ? l.event(u4) : u4);
      }
    };
  }
  function q(n4, u4, t5, i4, r4, o4, e4, f4, c4, s4) {
    var a4, h5, p5, v4, y5, d4, _5, k4, x4, M2, $2, I2, P2, A4, H2, T3 = u4.type;
    if (void 0 !== u4.constructor) return null;
    128 & t5.__u && (c4 = !!(32 & t5.__u), o4 = [f4 = u4.__e = t5.__e]), (a4 = l.__b) && a4(u4);
    n: if ("function" == typeof T3) try {
      if (k4 = u4.props, x4 = T3.prototype && T3.prototype.render, M2 = (a4 = T3.contextType) && i4[a4.__c], $2 = a4 ? M2 ? M2.props.value : a4.__ : i4, t5.__c ? _5 = (h5 = u4.__c = t5.__c).__ = h5.__E : (x4 ? u4.__c = h5 = new T3(k4, $2) : (u4.__c = h5 = new C(k4, $2), h5.constructor = T3, h5.render = Q), M2 && M2.sub(h5), h5.state || (h5.state = {}), h5.__n = i4, p5 = h5.__d = true, h5.__h = [], h5._sb = []), x4 && null == h5.__s && (h5.__s = h5.state), x4 && null != T3.getDerivedStateFromProps && (h5.__s == h5.state && (h5.__s = m({}, h5.__s)), m(h5.__s, T3.getDerivedStateFromProps(k4, h5.__s))), v4 = h5.props, y5 = h5.state, h5.__v = u4, p5) x4 && null == T3.getDerivedStateFromProps && null != h5.componentWillMount && h5.componentWillMount(), x4 && null != h5.componentDidMount && h5.__h.push(h5.componentDidMount);
      else {
        if (x4 && null == T3.getDerivedStateFromProps && k4 !== v4 && null != h5.componentWillReceiveProps && h5.componentWillReceiveProps(k4, $2), u4.__v == t5.__v || !h5.__e && null != h5.shouldComponentUpdate && false === h5.shouldComponentUpdate(k4, h5.__s, $2)) {
          u4.__v != t5.__v && (h5.props = k4, h5.state = h5.__s, h5.__d = false), u4.__e = t5.__e, u4.__k = t5.__k, u4.__k.some(function(n5) {
            n5 && (n5.__ = u4);
          }), w.push.apply(h5.__h, h5._sb), h5._sb = [], h5.__h.length && e4.push(h5);
          break n;
        }
        null != h5.componentWillUpdate && h5.componentWillUpdate(k4, h5.__s, $2), x4 && null != h5.componentDidUpdate && h5.__h.push(function() {
          h5.componentDidUpdate(v4, y5, d4);
        });
      }
      if (h5.context = $2, h5.props = k4, h5.__P = n4, h5.__e = false, I2 = l.__r, P2 = 0, x4) h5.state = h5.__s, h5.__d = false, I2 && I2(u4), a4 = h5.render(h5.props, h5.state, h5.context), w.push.apply(h5.__h, h5._sb), h5._sb = [];
      else do {
        h5.__d = false, I2 && I2(u4), a4 = h5.render(h5.props, h5.state, h5.context), h5.state = h5.__s;
      } while (h5.__d && ++P2 < 25);
      h5.state = h5.__s, null != h5.getChildContext && (i4 = m(m({}, i4), h5.getChildContext())), x4 && !p5 && null != h5.getSnapshotBeforeUpdate && (d4 = h5.getSnapshotBeforeUpdate(v4, y5)), A4 = null != a4 && a4.type === S && null == a4.key ? E(a4.props.children) : a4, f4 = L(n4, g(A4) ? A4 : [A4], u4, t5, i4, r4, o4, e4, f4, c4, s4), h5.base = u4.__e, u4.__u &= -161, h5.__h.length && e4.push(h5), _5 && (h5.__E = h5.__ = null);
    } catch (n5) {
      if (u4.__v = null, c4 || null != o4) if (n5.then) {
        for (u4.__u |= c4 ? 160 : 128; f4 && 8 == f4.nodeType && f4.nextSibling; ) f4 = f4.nextSibling;
        o4[o4.indexOf(f4)] = null, u4.__e = f4;
      } else {
        for (H2 = o4.length; H2--; ) b(o4[H2]);
        B(u4);
      }
      else u4.__e = t5.__e, u4.__k = t5.__k, n5.then || B(u4);
      l.__e(n5, u4, t5);
    }
    else null == o4 && u4.__v == t5.__v ? (u4.__k = t5.__k, u4.__e = t5.__e) : f4 = u4.__e = G(t5.__e, u4, t5, i4, r4, o4, e4, c4, s4);
    return (a4 = l.diffed) && a4(u4), 128 & u4.__u ? void 0 : f4;
  }
  function B(n4) {
    n4 && (n4.__c && (n4.__c.__e = true), n4.__k && n4.__k.some(B));
  }
  function D(n4, u4, t5) {
    for (var i4 = 0; i4 < t5.length; i4++) J(t5[i4], t5[++i4], t5[++i4]);
    l.__c && l.__c(u4, n4), n4.some(function(u5) {
      try {
        n4 = u5.__h, u5.__h = [], n4.some(function(n5) {
          n5.call(u5);
        });
      } catch (n5) {
        l.__e(n5, u5.__v);
      }
    });
  }
  function E(n4) {
    return "object" != typeof n4 || null == n4 || n4.__b > 0 ? n4 : g(n4) ? n4.map(E) : m({}, n4);
  }
  function G(u4, t5, i4, r4, o4, e4, f4, c4, s4) {
    var a4, h5, p5, v4, y5, w4, _5, m5 = i4.props || d, k4 = t5.props, x4 = t5.type;
    if ("svg" == x4 ? o4 = "http://www.w3.org/2000/svg" : "math" == x4 ? o4 = "http://www.w3.org/1998/Math/MathML" : o4 || (o4 = "http://www.w3.org/1999/xhtml"), null != e4) {
      for (a4 = 0; a4 < e4.length; a4++) if ((y5 = e4[a4]) && "setAttribute" in y5 == !!x4 && (x4 ? y5.localName == x4 : 3 == y5.nodeType)) {
        u4 = y5, e4[a4] = null;
        break;
      }
    }
    if (null == u4) {
      if (null == x4) return document.createTextNode(k4);
      u4 = document.createElementNS(o4, x4, k4.is && k4), c4 && (l.__m && l.__m(t5, e4), c4 = false), e4 = null;
    }
    if (null == x4) m5 === k4 || c4 && u4.data == k4 || (u4.data = k4);
    else {
      if (e4 = e4 && n.call(u4.childNodes), !c4 && null != e4) for (m5 = {}, a4 = 0; a4 < u4.attributes.length; a4++) m5[(y5 = u4.attributes[a4]).name] = y5.value;
      for (a4 in m5) y5 = m5[a4], "dangerouslySetInnerHTML" == a4 ? p5 = y5 : "children" == a4 || a4 in k4 || "value" == a4 && "defaultValue" in k4 || "checked" == a4 && "defaultChecked" in k4 || N(u4, a4, null, y5, o4);
      for (a4 in k4) y5 = k4[a4], "children" == a4 ? v4 = y5 : "dangerouslySetInnerHTML" == a4 ? h5 = y5 : "value" == a4 ? w4 = y5 : "checked" == a4 ? _5 = y5 : c4 && "function" != typeof y5 || m5[a4] === y5 || N(u4, a4, y5, m5[a4], o4);
      if (h5) c4 || p5 && (h5.__html == p5.__html || h5.__html == u4.innerHTML) || (u4.innerHTML = h5.__html), t5.__k = [];
      else if (p5 && (u4.innerHTML = ""), L("template" == t5.type ? u4.content : u4, g(v4) ? v4 : [v4], t5, i4, r4, "foreignObject" == x4 ? "http://www.w3.org/1999/xhtml" : o4, e4, f4, e4 ? e4[0] : i4.__k && $(i4, 0), c4, s4), null != e4) for (a4 = e4.length; a4--; ) b(e4[a4]);
      c4 || (a4 = "value", "progress" == x4 && null == w4 ? u4.removeAttribute("value") : null != w4 && (w4 !== u4[a4] || "progress" == x4 && !w4 || "option" == x4 && w4 != m5[a4]) && N(u4, a4, w4, m5[a4], o4), a4 = "checked", null != _5 && _5 != u4[a4] && N(u4, a4, _5, m5[a4], o4));
    }
    return u4;
  }
  function J(n4, u4, t5) {
    try {
      if ("function" == typeof n4) {
        var i4 = "function" == typeof n4.__u;
        i4 && n4.__u(), i4 && null == u4 || (n4.__u = n4(u4));
      } else n4.current = u4;
    } catch (n5) {
      l.__e(n5, t5);
    }
  }
  function K(n4, u4, t5) {
    var i4, r4;
    if (l.unmount && l.unmount(n4), (i4 = n4.ref) && (i4.current && i4.current != n4.__e || J(i4, null, u4)), null != (i4 = n4.__c)) {
      if (i4.componentWillUnmount) try {
        i4.componentWillUnmount();
      } catch (n5) {
        l.__e(n5, u4);
      }
      i4.base = i4.__P = null;
    }
    if (i4 = n4.__k) for (r4 = 0; r4 < i4.length; r4++) i4[r4] && K(i4[r4], u4, t5 || "function" != typeof n4.type);
    t5 || b(n4.__e), n4.__c = n4.__ = n4.__e = void 0;
  }
  function Q(n4, l5, u4) {
    return this.constructor(n4, u4);
  }
  function R(u4, t5, i4) {
    var r4, o4, e4, f4;
    t5 == document && (t5 = document.documentElement), l.__ && l.__(u4, t5), o4 = (r4 = "function" == typeof i4) ? null : i4 && i4.__k || t5.__k, e4 = [], f4 = [], q(t5, u4 = (!r4 && i4 || t5).__k = k(S, null, [u4]), o4 || d, d, t5.namespaceURI, !r4 && i4 ? [i4] : o4 ? null : t5.firstChild ? n.call(t5.childNodes) : null, e4, !r4 && i4 ? i4 : o4 ? o4.__e : t5.firstChild, r4, f4), D(e4, u4, f4);
  }
  function W(l5, u4, t5) {
    var i4, r4, o4, e4, f4 = m({}, l5.props);
    for (o4 in l5.type && l5.type.defaultProps && (e4 = l5.type.defaultProps), u4) "key" == o4 ? i4 = u4[o4] : "ref" == o4 ? r4 = u4[o4] : f4[o4] = void 0 === u4[o4] && null != e4 ? e4[o4] : u4[o4];
    return arguments.length > 2 && (f4.children = arguments.length > 3 ? n.call(arguments, 2) : t5), x(l5.type, f4, i4 || l5.key, r4 || l5.ref, null);
  }
  function X(n4) {
    function l5(n5) {
      var u4, t5;
      return this.getChildContext || (u4 = /* @__PURE__ */ new Set(), (t5 = {})[l5.__c] = this, this.getChildContext = function() {
        return t5;
      }, this.componentWillUnmount = function() {
        u4 = null;
      }, this.shouldComponentUpdate = function(n6) {
        this.props.value != n6.value && u4.forEach(function(n7) {
          n7.__e = true, A(n7);
        });
      }, this.sub = function(n6) {
        u4.add(n6);
        var l6 = n6.componentWillUnmount;
        n6.componentWillUnmount = function() {
          u4 && u4.delete(n6), l6 && l6.call(n6);
        };
      }), n5.children;
    }
    return l5.__c = "__cC" + y++, l5.__ = n4, l5.Provider = l5.__l = (l5.Consumer = function(n5, l6) {
      return n5.children(l6);
    }).contextType = l5, l5;
  }
  n = w.slice, l = { __e: function(n4, l5, u4, t5) {
    for (var i4, r4, o4; l5 = l5.__; ) if ((i4 = l5.__c) && !i4.__) try {
      if ((r4 = i4.constructor) && null != r4.getDerivedStateFromError && (i4.setState(r4.getDerivedStateFromError(n4)), o4 = i4.__d), null != i4.componentDidCatch && (i4.componentDidCatch(n4, t5 || {}), o4 = i4.__d), o4) return i4.__E = i4;
    } catch (l6) {
      n4 = l6;
    }
    throw n4;
  } }, u = 0, t = function(n4) {
    return null != n4 && void 0 === n4.constructor;
  }, C.prototype.setState = function(n4, l5) {
    var u4;
    u4 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n4 && (n4 = n4(m({}, u4), this.props)), n4 && m(u4, n4), null != n4 && this.__v && (l5 && this._sb.push(l5), A(this));
  }, C.prototype.forceUpdate = function(n4) {
    this.__v && (this.__e = true, n4 && this.__h.push(n4), A(this));
  }, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n4, l5) {
    return n4.__v.__b - l5.__v.__b;
  }, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, s = "__a" + f, a = /(PointerCapture)$|Capture$/i, h = 0, p = V(false), v = V(true), y = 0;

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2;
  var r2;
  var u2;
  var i2;
  var o2 = 0;
  var f2 = [];
  var c2 = l;
  var e2 = c2.__b;
  var a2 = c2.__r;
  var v2 = c2.diffed;
  var l2 = c2.__c;
  var m2 = c2.unmount;
  var s2 = c2.__;
  function p2(n4, t5) {
    c2.__h && c2.__h(r2, n4, o2 || t5), o2 = 0;
    var u4 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n4 >= u4.__.length && u4.__.push({}), u4.__[n4];
  }
  function d2(n4) {
    return o2 = 1, h2(D2, n4);
  }
  function h2(n4, u4, i4) {
    var o4 = p2(t2++, 2);
    if (o4.t = n4, !o4.__c && (o4.__ = [i4 ? i4(u4) : D2(void 0, u4), function(n5) {
      var t5 = o4.__N ? o4.__N[0] : o4.__[0], r4 = o4.t(t5, n5);
      t5 !== r4 && (o4.__N = [r4, o4.__[1]], o4.__c.setState({}));
    }], o4.__c = r2, !r2.__f)) {
      var f4 = function(n5, t5, r4) {
        if (!o4.__c.__H) return true;
        var u5 = o4.__c.__H.__.filter(function(n6) {
          return n6.__c;
        });
        if (u5.every(function(n6) {
          return !n6.__N;
        })) return !c4 || c4.call(this, n5, t5, r4);
        var i5 = o4.__c.props !== n5;
        return u5.some(function(n6) {
          if (n6.__N) {
            var t6 = n6.__[0];
            n6.__ = n6.__N, n6.__N = void 0, t6 !== n6.__[0] && (i5 = true);
          }
        }), c4 && c4.call(this, n5, t5, r4) || i5;
      };
      r2.__f = true;
      var c4 = r2.shouldComponentUpdate, e4 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n5, t5, r4) {
        if (this.__e) {
          var u5 = c4;
          c4 = void 0, f4(n5, t5, r4), c4 = u5;
        }
        e4 && e4.call(this, n5, t5, r4);
      }, r2.shouldComponentUpdate = f4;
    }
    return o4.__N || o4.__;
  }
  function y2(n4, u4) {
    var i4 = p2(t2++, 3);
    !c2.__s && C2(i4.__H, u4) && (i4.__ = n4, i4.u = u4, r2.__H.__h.push(i4));
  }
  function _2(n4, u4) {
    var i4 = p2(t2++, 4);
    !c2.__s && C2(i4.__H, u4) && (i4.__ = n4, i4.u = u4, r2.__h.push(i4));
  }
  function A2(n4) {
    return o2 = 5, T2(function() {
      return { current: n4 };
    }, []);
  }
  function T2(n4, r4) {
    var u4 = p2(t2++, 7);
    return C2(u4.__H, r4) && (u4.__ = n4(), u4.__H = r4, u4.__h = n4), u4.__;
  }
  function x2(n4) {
    var u4 = r2.context[n4.__c], i4 = p2(t2++, 9);
    return i4.c = n4, u4 ? (null == i4.__ && (i4.__ = true, u4.sub(r2)), u4.props.value) : n4.__;
  }
  function j2() {
    for (var n4; n4 = f2.shift(); ) {
      var t5 = n4.__H;
      if (n4.__P && t5) try {
        t5.__h.some(z2), t5.__h.some(B2), t5.__h = [];
      } catch (r4) {
        t5.__h = [], c2.__e(r4, n4.__v);
      }
    }
  }
  c2.__b = function(n4) {
    r2 = null, e2 && e2(n4);
  }, c2.__ = function(n4, t5) {
    n4 && t5.__k && t5.__k.__m && (n4.__m = t5.__k.__m), s2 && s2(n4, t5);
  }, c2.__r = function(n4) {
    a2 && a2(n4), t2 = 0;
    var i4 = (r2 = n4.__c).__H;
    i4 && (u2 === r2 ? (i4.__h = [], r2.__h = [], i4.__.some(function(n5) {
      n5.__N && (n5.__ = n5.__N), n5.u = n5.__N = void 0;
    })) : (i4.__h.some(z2), i4.__h.some(B2), i4.__h = [], t2 = 0)), u2 = r2;
  }, c2.diffed = function(n4) {
    v2 && v2(n4);
    var t5 = n4.__c;
    t5 && t5.__H && (t5.__H.__h.length && (1 !== f2.push(t5) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t5.__H.__.some(function(n5) {
      n5.u && (n5.__H = n5.u), n5.u = void 0;
    })), u2 = r2 = null;
  }, c2.__c = function(n4, t5) {
    t5.some(function(n5) {
      try {
        n5.__h.some(z2), n5.__h = n5.__h.filter(function(n6) {
          return !n6.__ || B2(n6);
        });
      } catch (r4) {
        t5.some(function(n6) {
          n6.__h && (n6.__h = []);
        }), t5 = [], c2.__e(r4, n5.__v);
      }
    }), l2 && l2(n4, t5);
  }, c2.unmount = function(n4) {
    m2 && m2(n4);
    var t5, r4 = n4.__c;
    r4 && r4.__H && (r4.__H.__.some(function(n5) {
      try {
        z2(n5);
      } catch (n6) {
        t5 = n6;
      }
    }), r4.__H = void 0, t5 && c2.__e(t5, r4.__v));
  };
  var k2 = "function" == typeof requestAnimationFrame;
  function w2(n4) {
    var t5, r4 = function() {
      clearTimeout(u4), k2 && cancelAnimationFrame(t5), setTimeout(n4);
    }, u4 = setTimeout(r4, 35);
    k2 && (t5 = requestAnimationFrame(r4));
  }
  function z2(n4) {
    var t5 = r2, u4 = n4.__c;
    "function" == typeof u4 && (n4.__c = void 0, u4()), r2 = t5;
  }
  function B2(n4) {
    var t5 = r2;
    n4.__c = n4.__(), r2 = t5;
  }
  function C2(n4, t5) {
    return !n4 || n4.length !== t5.length || t5.some(function(t6, r4) {
      return t6 !== n4[r4];
    });
  }
  function D2(n4, t5) {
    return "function" == typeof t5 ? t5(n4) : t5;
  }

  // node_modules/@preact/signals-core/dist/signals-core.module.js
  var i3 = /* @__PURE__ */ Symbol.for("preact-signals");
  function t3() {
    if (!(s3 > 1)) {
      var i4, t5 = false;
      !(function() {
        var i5 = c3;
        c3 = void 0;
        while (void 0 !== i5) {
          if (i5.S.v === i5.v) i5.S.i = i5.i;
          i5 = i5.o;
        }
      })();
      while (void 0 !== h3) {
        var n4 = h3;
        h3 = void 0;
        v3++;
        while (void 0 !== n4) {
          var r4 = n4.u;
          n4.u = void 0;
          n4.f &= -3;
          if (!(8 & n4.f) && w3(n4)) try {
            n4.c();
          } catch (n5) {
            if (!t5) {
              i4 = n5;
              t5 = true;
            }
          }
          n4 = r4;
        }
      }
      v3 = 0;
      s3--;
      if (t5) throw i4;
    } else s3--;
  }
  function n2(i4) {
    if (s3 > 0) return i4();
    e3 = ++u3;
    s3++;
    try {
      return i4();
    } finally {
      t3();
    }
  }
  var r3 = void 0;
  function o3(i4) {
    var t5 = r3;
    r3 = void 0;
    try {
      return i4();
    } finally {
      r3 = t5;
    }
  }
  var f3;
  var h3 = void 0;
  var s3 = 0;
  var v3 = 0;
  var u3 = 0;
  var e3 = 0;
  var c3 = void 0;
  var d3 = 0;
  function a3(i4) {
    if (void 0 !== r3) {
      var t5 = i4.n;
      if (void 0 === t5 || t5.t !== r3) {
        t5 = { i: 0, S: i4, p: r3.s, n: void 0, t: r3, e: void 0, x: void 0, r: t5 };
        if (void 0 !== r3.s) r3.s.n = t5;
        r3.s = t5;
        i4.n = t5;
        if (32 & r3.f) i4.S(t5);
        return t5;
      } else if (-1 === t5.i) {
        t5.i = 0;
        if (void 0 !== t5.n) {
          t5.n.p = t5.p;
          if (void 0 !== t5.p) t5.p.n = t5.n;
          t5.p = r3.s;
          t5.n = void 0;
          r3.s.n = t5;
          r3.s = t5;
        }
        return t5;
      }
    }
  }
  function l3(i4, t5) {
    this.v = i4;
    this.i = 0;
    this.n = void 0;
    this.t = void 0;
    this.l = 0;
    this.W = null == t5 ? void 0 : t5.watched;
    this.Z = null == t5 ? void 0 : t5.unwatched;
    this.name = null == t5 ? void 0 : t5.name;
  }
  l3.prototype.brand = i3;
  l3.prototype.h = function() {
    return true;
  };
  l3.prototype.S = function(i4) {
    var t5 = this, n4 = this.t;
    if (n4 !== i4 && void 0 === i4.e) {
      i4.x = n4;
      this.t = i4;
      if (void 0 !== n4) n4.e = i4;
      else o3(function() {
        var i5;
        null == (i5 = t5.W) || i5.call(t5);
      });
    }
  };
  l3.prototype.U = function(i4) {
    var t5 = this;
    if (void 0 !== this.t) {
      var n4 = i4.e, r4 = i4.x;
      if (void 0 !== n4) {
        n4.x = r4;
        i4.e = void 0;
      }
      if (void 0 !== r4) {
        r4.e = n4;
        i4.x = void 0;
      }
      if (i4 === this.t) {
        this.t = r4;
        if (void 0 === r4) o3(function() {
          var i5;
          null == (i5 = t5.Z) || i5.call(t5);
        });
      }
    }
  };
  l3.prototype.subscribe = function(i4) {
    var t5 = this;
    return j3(function() {
      var n4 = t5.value, o4 = r3;
      r3 = void 0;
      try {
        i4(n4);
      } finally {
        r3 = o4;
      }
    }, { name: "sub" });
  };
  l3.prototype.valueOf = function() {
    return this.value;
  };
  l3.prototype.toString = function() {
    return this.value + "";
  };
  l3.prototype.toJSON = function() {
    return this.value;
  };
  l3.prototype.peek = function() {
    var i4 = r3;
    r3 = void 0;
    try {
      return this.value;
    } finally {
      r3 = i4;
    }
  };
  Object.defineProperty(l3.prototype, "value", { get: function() {
    var i4 = a3(this);
    if (void 0 !== i4) i4.i = this.i;
    return this.v;
  }, set: function(i4) {
    if (i4 !== this.v) {
      if (v3 > 100) throw new Error("Cycle detected");
      !(function(i5) {
        if (0 !== s3 && 0 === v3) {
          if (i5.l !== e3) {
            i5.l = e3;
            c3 = { S: i5, v: i5.v, i: i5.i, o: c3 };
          }
        }
      })(this);
      this.v = i4;
      this.i++;
      d3++;
      s3++;
      try {
        for (var n4 = this.t; void 0 !== n4; n4 = n4.x) n4.t.N();
      } finally {
        t3();
      }
    }
  } });
  function y3(i4, t5) {
    return new l3(i4, t5);
  }
  function w3(i4) {
    for (var t5 = i4.s; void 0 !== t5; t5 = t5.n) if (t5.S.i !== t5.i || !t5.S.h() || t5.S.i !== t5.i) return true;
    return false;
  }
  function _3(i4) {
    for (var t5 = i4.s; void 0 !== t5; t5 = t5.n) {
      var n4 = t5.S.n;
      if (void 0 !== n4) t5.r = n4;
      t5.S.n = t5;
      t5.i = -1;
      if (void 0 === t5.n) {
        i4.s = t5;
        break;
      }
    }
  }
  function b2(i4) {
    var t5 = i4.s, n4 = void 0;
    while (void 0 !== t5) {
      var r4 = t5.p;
      if (-1 === t5.i) {
        t5.S.U(t5);
        if (void 0 !== r4) r4.n = t5.n;
        if (void 0 !== t5.n) t5.n.p = r4;
      } else n4 = t5;
      t5.S.n = t5.r;
      if (void 0 !== t5.r) t5.r = void 0;
      t5 = r4;
    }
    i4.s = n4;
  }
  function p3(i4, t5) {
    l3.call(this, void 0);
    this.x = i4;
    this.s = void 0;
    this.g = d3 - 1;
    this.f = 4;
    this.W = null == t5 ? void 0 : t5.watched;
    this.Z = null == t5 ? void 0 : t5.unwatched;
    this.name = null == t5 ? void 0 : t5.name;
  }
  p3.prototype = new l3();
  p3.prototype.h = function() {
    this.f &= -3;
    if (1 & this.f) return false;
    if (32 == (36 & this.f)) return true;
    this.f &= -5;
    if (this.g === d3) return true;
    this.g = d3;
    this.f |= 1;
    if (this.i > 0 && !w3(this)) {
      this.f &= -2;
      return true;
    }
    var i4 = r3;
    try {
      _3(this);
      r3 = this;
      var t5 = this.x();
      if (16 & this.f || this.v !== t5 || 0 === this.i) {
        this.v = t5;
        this.f &= -17;
        this.i++;
      }
    } catch (i5) {
      this.v = i5;
      this.f |= 16;
      this.i++;
    }
    r3 = i4;
    b2(this);
    this.f &= -2;
    return true;
  };
  p3.prototype.S = function(i4) {
    if (void 0 === this.t) {
      this.f |= 36;
      for (var t5 = this.s; void 0 !== t5; t5 = t5.n) t5.S.S(t5);
    }
    l3.prototype.S.call(this, i4);
  };
  p3.prototype.U = function(i4) {
    if (void 0 !== this.t) {
      l3.prototype.U.call(this, i4);
      if (void 0 === this.t) {
        this.f &= -33;
        for (var t5 = this.s; void 0 !== t5; t5 = t5.n) t5.S.U(t5);
      }
    }
  };
  p3.prototype.N = function() {
    if (!(2 & this.f)) {
      this.f |= 6;
      for (var i4 = this.t; void 0 !== i4; i4 = i4.x) i4.t.N();
    }
  };
  Object.defineProperty(p3.prototype, "value", { get: function() {
    if (1 & this.f) throw new Error("Cycle detected");
    var i4 = a3(this);
    this.h();
    if (void 0 !== i4) i4.i = this.i;
    if (16 & this.f) throw this.v;
    return this.v;
  } });
  function g2(i4, t5) {
    return new p3(i4, t5);
  }
  function S2(i4) {
    var n4 = i4.m;
    i4.m = void 0;
    if ("function" == typeof n4) {
      s3++;
      var o4 = r3;
      r3 = void 0;
      try {
        n4();
      } catch (t5) {
        i4.f &= -2;
        i4.f |= 8;
        m3(i4);
        throw t5;
      } finally {
        r3 = o4;
        t3();
      }
    }
  }
  function m3(i4) {
    for (var t5 = i4.s; void 0 !== t5; t5 = t5.n) t5.S.U(t5);
    i4.x = void 0;
    i4.s = void 0;
    S2(i4);
  }
  function x3(i4) {
    if (r3 !== this) throw new Error("Out-of-order effect");
    b2(this);
    r3 = i4;
    this.f &= -2;
    if (8 & this.f) m3(this);
    t3();
  }
  function E2(i4, t5) {
    this.x = i4;
    this.m = void 0;
    this.s = void 0;
    this.u = void 0;
    this.f = 32;
    this.name = null == t5 ? void 0 : t5.name;
    if (f3) f3.push(this);
  }
  E2.prototype.c = function() {
    var i4 = this.S();
    try {
      if (8 & this.f) return;
      if (void 0 === this.x) return;
      var t5 = this.x();
      if ("function" == typeof t5) this.m = t5;
    } finally {
      i4();
    }
  };
  E2.prototype.S = function() {
    if (1 & this.f) throw new Error("Cycle detected");
    this.f |= 1;
    this.f &= -9;
    S2(this);
    _3(this);
    s3++;
    var i4 = r3;
    r3 = this;
    return x3.bind(this, i4);
  };
  E2.prototype.N = function() {
    if (!(2 & this.f)) {
      this.f |= 2;
      this.u = h3;
      h3 = this;
    }
  };
  E2.prototype.d = function() {
    this.f |= 8;
    if (!(1 & this.f)) m3(this);
  };
  E2.prototype.dispose = function() {
    this.d();
  };
  function j3(i4, t5) {
    var n4 = new E2(i4, t5);
    try {
      n4.c();
    } catch (i5) {
      n4.d();
      throw i5;
    }
    var r4 = n4.d.bind(n4);
    r4[Symbol.dispose] = r4;
    return r4;
  }

  // node_modules/@preact/signals/dist/signals.module.js
  var h4;
  var l4;
  var p4;
  var m4 = "undefined" != typeof window && !!window.__PREACT_SIGNALS_DEVTOOLS__;
  var _4 = [];
  j3(function() {
    h4 = this.N;
  })();
  function g3(i4, t5) {
    l[i4] = t5.bind(null, l[i4] || function() {
    });
  }
  function y4(i4) {
    if (p4) p4();
    p4 = i4 && i4.S();
  }
  function b3(i4) {
    var n4 = this, r4 = i4.data, o4 = useSignal(r4);
    o4.value = r4;
    var e4 = T2(function() {
      var i5 = n4, r5 = n4.__v;
      while (r5 = r5.__) if (r5.__c) {
        r5.__c.__$f |= 4;
        break;
      }
      var f4 = g2(function() {
        var i6 = o4.value.value;
        return 0 === i6 ? 0 : true === i6 ? "" : i6 || "";
      }), e5 = g2(function() {
        return !Array.isArray(f4.value) && !t(f4.value);
      }), u5 = j3(function() {
        this.N = M;
        if (e5.value) {
          var n5 = f4.value;
          if (i5.__v && i5.__v.__e && 3 === i5.__v.__e.nodeType) i5.__v.__e.data = n5;
        }
      }), c5 = n4.__$u.d;
      n4.__$u.d = function() {
        u5();
        c5.call(this);
      };
      return [e5, f4];
    }, []), u4 = e4[0], c4 = e4[1];
    return u4.value ? c4.peek() : c4.value;
  }
  b3.displayName = "ReactiveTextNode";
  Object.defineProperties(l3.prototype, { constructor: { configurable: true, value: void 0 }, type: { configurable: true, value: b3 }, props: { configurable: true, get: function() {
    return { data: this };
  } }, __b: { configurable: true, value: 1 } });
  g3("__b", function(i4, n4) {
    if (m4 && "function" == typeof n4.type) window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
    if ("string" == typeof n4.type) {
      var t5, r4 = n4.props;
      for (var f4 in r4) if ("children" !== f4) {
        var o4 = r4[f4];
        if (o4 instanceof l3) {
          if (!t5) n4.__np = t5 = {};
          t5[f4] = o4;
          r4[f4] = o4.peek();
        }
      }
    }
    i4(n4);
  });
  g3("__r", function(i4, n4) {
    if (m4 && "function" == typeof n4.type) window.__PREACT_SIGNALS_DEVTOOLS__.enterComponent(n4);
    if (n4.type !== S) {
      y4();
      var t5, f4 = n4.__c;
      if (f4) {
        f4.__$f &= -2;
        if (void 0 === (t5 = f4.__$u)) f4.__$u = t5 = (function(i5) {
          var n5;
          j3(function() {
            n5 = this;
          });
          n5.c = function() {
            f4.__$f |= 1;
            f4.setState({});
          };
          return n5;
        })();
      }
      l4 = f4;
      y4(t5);
    }
    i4(n4);
  });
  g3("__e", function(i4, n4, t5, r4) {
    if (m4) window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
    y4();
    l4 = void 0;
    i4(n4, t5, r4);
  });
  g3("diffed", function(i4, n4) {
    if (m4 && "function" == typeof n4.type) window.__PREACT_SIGNALS_DEVTOOLS__.exitComponent();
    y4();
    l4 = void 0;
    var t5;
    if ("string" == typeof n4.type && (t5 = n4.__e)) {
      var r4 = n4.__np, f4 = n4.props;
      if (r4) {
        var o4 = t5.U;
        if (o4) for (var e4 in o4) {
          var u4 = o4[e4];
          if (void 0 !== u4 && !(e4 in r4)) {
            u4.d();
            o4[e4] = void 0;
          }
        }
        else {
          o4 = {};
          t5.U = o4;
        }
        for (var a4 in r4) {
          var c4 = o4[a4], v4 = r4[a4];
          if (void 0 === c4) {
            c4 = k3(t5, a4, v4, f4);
            o4[a4] = c4;
          } else c4.o(v4, f4);
        }
      }
    }
    i4(n4);
  });
  function k3(i4, n4, t5, r4) {
    var f4 = n4 in i4 && void 0 === i4.ownerSVGElement, o4 = y3(t5);
    return { o: function(i5, n5) {
      o4.value = i5;
      r4 = n5;
    }, d: j3(function() {
      this.N = M;
      var t6 = o4.value.value;
      if (r4[n4] !== t6) {
        r4[n4] = t6;
        if (f4) i4[n4] = t6;
        else if (null != t6 && (false !== t6 || "-" === n4[4])) i4.setAttribute(n4, t6);
        else i4.removeAttribute(n4);
      }
    }) };
  }
  g3("unmount", function(i4, n4) {
    if ("string" == typeof n4.type) {
      var t5 = n4.__e;
      if (t5) {
        var r4 = t5.U;
        if (r4) {
          t5.U = void 0;
          for (var f4 in r4) {
            var o4 = r4[f4];
            if (o4) o4.d();
          }
        }
      }
    } else {
      var e4 = n4.__c;
      if (e4) {
        var u4 = e4.__$u;
        if (u4) {
          e4.__$u = void 0;
          u4.d();
        }
      }
    }
    i4(n4);
  });
  g3("__h", function(i4, n4, t5, r4) {
    if (r4 < 3 || 9 === r4) n4.__$f |= 2;
    i4(n4, t5, r4);
  });
  C.prototype.shouldComponentUpdate = function(i4, n4) {
    var t5 = this.__$u, r4 = t5 && void 0 !== t5.s;
    for (var f4 in n4) return true;
    if (this.__f || "boolean" == typeof this.u && true === this.u) {
      var o4 = 2 & this.__$f;
      if (!(r4 || o4 || 4 & this.__$f)) return true;
      if (1 & this.__$f) return true;
    } else {
      if (!(r4 || 4 & this.__$f)) return true;
      if (3 & this.__$f) return true;
    }
    for (var e4 in i4) if ("__source" !== e4 && i4[e4] !== this.props[e4]) return true;
    for (var u4 in this.props) if (!(u4 in i4)) return true;
    return false;
  };
  function useSignal(i4, n4) {
    return d2(function() {
      return y3(i4, n4);
    })[0];
  }
  var A3 = function(i4) {
    queueMicrotask(function() {
      queueMicrotask(i4);
    });
  };
  function F() {
    n2(function() {
      var i4;
      while (i4 = _4.shift()) h4.call(i4);
    });
  }
  function M() {
    if (1 === _4.push(this)) (l.requestAnimationFrame || A3)(F);
  }

  // node_modules/htm/dist/htm.module.js
  var n3 = function(t5, s4, r4, e4) {
    var u4;
    s4[0] = 0;
    for (var h5 = 1; h5 < s4.length; h5++) {
      var p5 = s4[h5++], a4 = s4[h5] ? (s4[0] |= p5 ? 1 : 2, r4[s4[h5++]]) : s4[++h5];
      3 === p5 ? e4[0] = a4 : 4 === p5 ? e4[1] = Object.assign(e4[1] || {}, a4) : 5 === p5 ? (e4[1] = e4[1] || {})[s4[++h5]] = a4 : 6 === p5 ? e4[1][s4[++h5]] += a4 + "" : p5 ? (u4 = t5.apply(a4, n3(t5, a4, r4, ["", null])), e4.push(u4), a4[0] ? s4[0] |= 2 : (s4[h5 - 2] = 0, s4[h5] = u4)) : e4.push(a4);
    }
    return e4;
  };
  var t4 = /* @__PURE__ */ new Map();
  function htm_module_default(s4) {
    var r4 = t4.get(this);
    return r4 || (r4 = /* @__PURE__ */ new Map(), t4.set(this, r4)), (r4 = n3(this, r4.get(s4) || (r4.set(s4, r4 = (function(n4) {
      for (var t5, s5, r5 = 1, e4 = "", u4 = "", h5 = [0], p5 = function(n5) {
        1 === r5 && (n5 || (e4 = e4.replace(/^\s*\n\s*|\s*\n\s*$/g, ""))) ? h5.push(0, n5, e4) : 3 === r5 && (n5 || e4) ? (h5.push(3, n5, e4), r5 = 2) : 2 === r5 && "..." === e4 && n5 ? h5.push(4, n5, 0) : 2 === r5 && e4 && !n5 ? h5.push(5, 0, true, e4) : r5 >= 5 && ((e4 || !n5 && 5 === r5) && (h5.push(r5, 0, e4, s5), r5 = 6), n5 && (h5.push(r5, n5, 0, s5), r5 = 6)), e4 = "";
      }, a4 = 0; a4 < n4.length; a4++) {
        a4 && (1 === r5 && p5(), p5(a4));
        for (var l5 = 0; l5 < n4[a4].length; l5++) t5 = n4[a4][l5], 1 === r5 ? "<" === t5 ? (p5(), h5 = [h5], r5 = 3) : e4 += t5 : 4 === r5 ? "--" === e4 && ">" === t5 ? (r5 = 1, e4 = "") : e4 = t5 + e4[0] : u4 ? t5 === u4 ? u4 = "" : e4 += t5 : '"' === t5 || "'" === t5 ? u4 = t5 : ">" === t5 ? (p5(), r5 = 1) : r5 && ("=" === t5 ? (r5 = 5, s5 = e4, e4 = "") : "/" === t5 && (r5 < 5 || ">" === n4[a4][l5 + 1]) ? (p5(), 3 === r5 && (h5 = h5[0]), r5 = h5, (h5 = h5[0]).push(2, 0, r5), r5 = 0) : " " === t5 || "	" === t5 || "\n" === t5 || "\r" === t5 ? (p5(), r5 = 2) : e4 += t5), 3 === r5 && "!--" === e4 && (r5 = 4, h5 = h5[0]);
      }
      return p5(), h5;
    })(s4)), r4), arguments, [])).length > 1 ? r4 : r4[0];
  }

  // node_modules/regexparam/dist/index.mjs
  function parse(input, loose) {
    if (input instanceof RegExp) return { keys: false, pattern: input };
    var c4, o4, tmp, ext, keys = [], pattern = "", arr = input.split("/");
    arr[0] || arr.shift();
    while (tmp = arr.shift()) {
      c4 = tmp[0];
      if (c4 === "*") {
        keys.push(c4);
        pattern += tmp[1] === "?" ? "(?:/(.*))?" : "/(.*)";
      } else if (c4 === ":") {
        o4 = tmp.indexOf("?", 1);
        ext = tmp.indexOf(".", 1);
        keys.push(tmp.substring(1, !!~o4 ? o4 : !!~ext ? ext : tmp.length));
        pattern += !!~o4 && !~ext ? "(?:/([^/]+?))?" : "/([^/]+?)";
        if (!!~ext) pattern += (!!~o4 ? "?" : "") + "\\" + tmp.substring(ext);
      } else {
        pattern += "/" + tmp;
      }
    }
    return {
      keys,
      pattern: new RegExp("^" + pattern + (loose ? "(?=$|/)" : "/?$"), "i")
    };
  }

  // node_modules/wouter-preact/esm/preact-deps-dec5c677.js
  var canUseDOM = !!(typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined");
  function is(x4, y5) {
    return x4 === y5 && (x4 !== 0 || 1 / x4 === 1 / y5) || x4 !== x4 && y5 !== y5;
  }
  function useSyncExternalStore(subscribe, getSnapshot, getSSRSnapshot) {
    if (getSSRSnapshot && !canUseDOM) getSnapshot = getSSRSnapshot;
    const value = getSnapshot();
    const [{ _instance }, forceUpdate] = d2({
      _instance: { _value: value, _getSnapshot: getSnapshot }
    });
    _2(() => {
      _instance._value = value;
      _instance._getSnapshot = getSnapshot;
      if (!is(_instance._value, getSnapshot())) {
        forceUpdate({ _instance });
      }
    }, [subscribe, value, getSnapshot]);
    y2(() => {
      if (!is(_instance._value, _instance._getSnapshot())) {
        forceUpdate({ _instance });
      }
      return subscribe(() => {
        if (!is(_instance._value, _instance._getSnapshot())) {
          forceUpdate({ _instance });
        }
      });
    }, [subscribe]);
    return value;
  }
  function forwardRef(component) {
    return component;
  }
  var useEvent = (fn) => {
    const ref = A2([fn, (...args) => ref[0](...args)]).current;
    _2(() => {
      ref[0] = fn;
    });
    return ref[1];
  };

  // node_modules/wouter-preact/esm/use-browser-location.js
  var eventPopstate = "popstate";
  var eventPushState = "pushState";
  var eventReplaceState = "replaceState";
  var eventHashchange = "hashchange";
  var events = [
    eventPopstate,
    eventPushState,
    eventReplaceState,
    eventHashchange
  ];
  var subscribeToLocationUpdates = (callback) => {
    for (const event of events) {
      addEventListener(event, callback);
    }
    return () => {
      for (const event of events) {
        removeEventListener(event, callback);
      }
    };
  };
  var useLocationProperty = (fn, ssrFn) => useSyncExternalStore(subscribeToLocationUpdates, fn, ssrFn);
  var currentSearch = () => location.search;
  var useSearch = ({ ssrSearch = "" } = {}) => useLocationProperty(currentSearch, () => ssrSearch);
  var currentPathname = () => location.pathname;
  var usePathname = ({ ssrPath } = {}) => useLocationProperty(
    currentPathname,
    ssrPath ? () => ssrPath : currentPathname
  );
  var navigate = (to, { replace = false, state = null } = {}) => history[replace ? eventReplaceState : eventPushState](state, "", to);
  var useBrowserLocation = (opts = {}) => [usePathname(opts), navigate];
  var patchKey = /* @__PURE__ */ Symbol.for("wouter_v3");
  if (typeof history !== "undefined" && typeof window[patchKey] === "undefined") {
    for (const type of [eventPushState, eventReplaceState]) {
      const original = history[type];
      history[type] = function() {
        const result = original.apply(this, arguments);
        const event = new Event(type);
        event.arguments = arguments;
        dispatchEvent(event);
        return result;
      };
    }
    Object.defineProperty(window, patchKey, { value: true });
  }

  // node_modules/wouter-preact/esm/index.js
  var _relativePath = (base, path) => !path.toLowerCase().indexOf(base.toLowerCase()) ? path.slice(base.length) || "/" : "~" + path;
  var baseDefaults = (base = "") => base === "/" ? "" : base;
  var absolutePath = (to, base) => to[0] === "~" ? to.slice(1) : baseDefaults(base) + to;
  var relativePath = (base = "", path) => _relativePath(unescape(baseDefaults(base)), unescape(path));
  var unescape = (str) => {
    try {
      return decodeURI(str);
    } catch (_e) {
      return str;
    }
  };
  var defaultRouter = {
    hook: useBrowserLocation,
    searchHook: useSearch,
    parser: parse,
    base: "",
    // this option is used to override the current location during SSR
    ssrPath: void 0,
    ssrSearch: void 0,
    // optional context to track render state during SSR
    ssrContext: void 0,
    // customizes how `href` props are transformed for <Link />
    hrefs: (x4) => x4
  };
  var RouterCtx = X(defaultRouter);
  var useRouter = () => x2(RouterCtx);
  var Params0 = {};
  var ParamsCtx = X(Params0);
  var useLocationFromRouter = (router) => {
    const [location2, navigate2] = router.hook(router);
    return [
      relativePath(router.base, location2),
      useEvent((to, navOpts) => navigate2(absolutePath(to, router.base), navOpts))
    ];
  };
  var useLocation = () => useLocationFromRouter(useRouter());
  var Router = ({ children, ...props }) => {
    var _a, _b, _c, _d;
    const parent_ = useRouter();
    const parent = props.hook ? defaultRouter : parent_;
    let value = parent;
    const [path, search] = (_b = (_a = props.ssrPath) == null ? void 0 : _a.split("?")) != null ? _b : [];
    if (search) props.ssrSearch = search, props.ssrPath = path;
    props.hrefs = (_d = props.hrefs) != null ? _d : (_c = props.hook) == null ? void 0 : _c.hrefs;
    let ref = A2({}), prev = ref.current, next = prev;
    for (let k4 in parent) {
      const option = k4 === "base" ? (
        /* base is special case, it is appended to the parent's base */
        parent[k4] + (props[k4] || "")
      ) : props[k4] || parent[k4];
      if (prev === next && option !== next[k4]) {
        ref.current = next = { ...next };
      }
      next[k4] = option;
      if (option !== parent[k4] || option !== value[k4]) value = next;
    }
    return k(RouterCtx.Provider, { value, children });
  };
  var Link = forwardRef((props, ref) => {
    const router = useRouter();
    const [currentPath, navigate2] = useLocationFromRouter(router);
    const {
      to = "",
      href: targetPath = to,
      onClick: _onClick,
      asChild,
      children,
      className: cls,
      /* eslint-disable no-unused-vars */
      replace,
      state,
      /* eslint-enable no-unused-vars */
      ...restProps
    } = props;
    const onClick = useEvent((event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0)
        return;
      _onClick == null ? void 0 : _onClick(event);
      if (!event.defaultPrevented) {
        event.preventDefault();
        navigate2(targetPath, props);
      }
    });
    const href = router.hrefs(
      targetPath[0] === "~" ? targetPath.slice(1) : router.base + targetPath,
      router
      // pass router as a second argument for convinience
    );
    return asChild && t(children) ? W(children, { onClick, href }) : k("a", {
      ...restProps,
      onClick,
      href,
      // `className` can be a function to apply the class if this link is active
      className: (cls == null ? void 0 : cls.call) ? cls(currentPath === targetPath) : cls,
      children,
      ref
    });
  });

  // src/messages/en.js
  var enMessages = {
    "app.statusTitle": "Service Overview",
    "app.adminTitle": "Admin Console",
    "app.statusCopy": "Inspect provider success rates, failures, and token usage.",
    "app.adminCopy": "Manage global settings, providers, keys, and recent logs.",
    "meta.version": "Build",
    "nav.status": "Status",
    "nav.admin": "Admin",
    "action.refresh": "Refresh",
    "action.close": "Close",
    "action.cancel": "Cancel",
    "action.logout": "Logout",
    "action.save": "Save",
    "action.delete": "Delete",
    "action.clearCache": "Clear cache",
    "action.importKeys": "Import keys",
    "action.enableSelected": "Enable selected",
    "action.disableSelected": "Disable selected",
    "action.deleteSelected": "Delete selected",
    "action.selectVisible": "Select visible",
    "action.clearSelected": "Clear selected",
    "action.openLogs": "Open logs",
    "action.createProvider": "Create provider",
    "status.health": "Health",
    "status.providers": "Providers",
    "status.success": "Successful requests",
    "status.error": "Failed requests",
    "status.inputTokens": "Input tokens",
    "status.outputTokens": "Output tokens",
    "status.cacheTokens": "Cache tokens",
    "status.cacheHits": "Cache hits",
    "status.successRate": "Success rate",
    "status.errorRate": "Error rate",
    "status.availableKeys": "Available keys",
    "status.empty": "No provider data yet",
    "status.loading": "Loading status overview",
    "status.reloadFailed": "Failed to load status overview",
    "admin.loginTitle": "Admin Sign In",
    "admin.loginHint": "The admin session is kept with same-origin cookies so the browser can stay signed in.",
    "admin.adminKey": "Admin key",
    "admin.adminKeyPlaceholder": "Enter the admin key",
    "admin.login": "Sign in",
    "admin.loginFailed": "Admin login failed",
    "admin.globalTitle": "Global Settings",
    "admin.globalSummary": "Manage the admin key, client keys, and token estimation in one place.",
    "admin.clientKeys": "Client access keys",
    "admin.clientKeysHint": "One per line, or separated with ASCII commas",
    "admin.tokenEstimation": "Estimate tokens when the upstream omits counts",
    "admin.globalSaveSuccess": "Global settings saved",
    "admin.globalSaveFailed": "Failed to save global settings",
    "admin.adminKeyConfigured": "Admin key configured",
    "admin.adminKeyMissing": "Admin key missing",
    "admin.providerWorkspace": "Provider workspace",
    "admin.providerWorkspaceEmpty": "Select a provider from the left, or create one first.",
    "admin.providerSearch": "Search providers",
    "admin.providerSearchPlaceholder": "Filter by provider name",
    "admin.providerListTitle": "Providers",
    "admin.providerListEmpty": "No providers yet",
    "admin.providerCreateTitle": "Create Provider",
    "admin.providerCreateSuccess": "Provider saved",
    "admin.providerCreateFailed": "Failed to save provider",
    "admin.providerSaveSuccess": "Provider updated",
    "admin.providerSaveFailed": "Failed to update provider",
    "admin.providerDeleteConfirm": "Deleting a provider also removes its cache and stats. Continue?",
    "admin.providerDeleteSuccess": "Provider deleted",
    "admin.providerDeleteFailed": "Failed to delete provider",
    "admin.providerDiscardDraft": "This provider has unsaved changes. Switching will discard them. Continue?",
    "admin.cacheClearConfirm": "This removes the local cache for the current provider. Continue?",
    "admin.cacheClearSuccess": "Cache cleared",
    "admin.cacheClearFailed": "Failed to clear cache",
    "admin.importSuccess": "Keys imported",
    "admin.importFailed": "Failed to import keys",
    "admin.bulkActionSuccess": "Bulk action completed",
    "admin.bulkActionFailed": "Bulk action failed",
    "admin.bulkDeleteConfirm": "Deleting selected keys cannot be undone. Continue?",
    "admin.singleDeleteConfirm": "Deleting this key cannot be undone. Continue?",
    "admin.keySearch": "Filter keys",
    "admin.keySearchPlaceholder": "Filter by masked value or reference",
    "admin.bulkMode": "Disable mode",
    "admin.bulkModeTimed": "Disable for a duration",
    "admin.bulkModeForever": "Disable forever",
    "admin.bulkDisableSeconds": "Disable seconds",
    "admin.bulkDisableRange": "Allowed range {min} - {max} seconds",
    "admin.importPlaceholder": "One per line, or separated with ASCII commas",
    "admin.noKeys": "This provider has no keys yet",
    "admin.logsTitle": "Recent Logs",
    "admin.logsHint": "Use the terminal-like log view to inspect auth, proxy, and cache activity.",
    "admin.hidePanelLogs": "Hide panel, health, and favicon requests",
    "admin.logsEmpty": "No logs yet",
    "admin.overviewLoadFailed": "Failed to load admin overview",
    "admin.unauthorized": "You are not signed in yet. Enter the admin key first.",
    "provider.name": "Name",
    "provider.type": "Type",
    "provider.baseUrl": "Base URL",
    "provider.baseUrlPlaceholder": "Leave empty to use the default base URL",
    "provider.keyStrategy": "Key strategy",
    "provider.failThreshold": "Failure threshold",
    "provider.minDisableSecs": "Minimum disable seconds",
    "provider.maxDisableSecs": "Maximum disable seconds",
    "provider.cacheEnabled": "Enable cache",
    "provider.cacheMaxEntries": "Maximum cache entries",
    "provider.stats": "Current metrics",
    "provider.keys": "Keys",
    "provider.maskedValue": "Masked value",
    "provider.reference": "Reference",
    "provider.disabledUntil": "Disabled until",
    "provider.fails": "Consecutive fails",
    "provider.notDisabled": "Not disabled",
    "provider.permanent": "Disabled forever",
    "provider.invalidDisabledUntil": "Invalid disable timestamp",
    "provider.selectedCount": "{count} keys selected",
    "provider.availableKeys": "{available}/{total} available",
    "provider.clearSelectionOnRefresh": "Selection was synchronized with the latest overview",
    "provider.type.openai_chat": "OpenAI Chat",
    "provider.type.openai_responses": "OpenAI Responses",
    "provider.type.claude": "Claude",
    "provider.type.gemini": "Gemini",
    "provider.strategy.round_robin": "Round robin",
    "provider.strategy.fill": "Fill",
    "message.loading": "Loading",
    "message.runtimeError": "Runtime error",
    "message.noData": "No data"
  };

  // src/messages/zh.js
  var zhMessages = {
    "app.statusTitle": "运行总览",
    "app.adminTitle": "管理控制台",
    "app.statusCopy": "查看各提供商成功率、错误率与 Token 消耗。",
    "app.adminCopy": "维护全局配置、提供商、密钥与最近日志。",
    "meta.version": "构建版本",
    "nav.status": "状态页",
    "nav.admin": "管理页",
    "action.refresh": "刷新",
    "action.close": "关闭",
    "action.cancel": "取消",
    "action.logout": "退出登录",
    "action.save": "保存",
    "action.delete": "删除",
    "action.clearCache": "清空缓存",
    "action.importKeys": "导入密钥",
    "action.enableSelected": "启用已选",
    "action.disableSelected": "禁用已选",
    "action.deleteSelected": "删除已选",
    "action.selectVisible": "选择当前可见项",
    "action.clearSelected": "清空已选",
    "action.openLogs": "查看日志",
    "action.createProvider": "新增提供商",
    "status.health": "服务状态",
    "status.providers": "提供商数量",
    "status.success": "成功请求",
    "status.error": "错误请求",
    "status.inputTokens": "输入 Token",
    "status.outputTokens": "输出 Token",
    "status.cacheTokens": "缓存 Token",
    "status.cacheHits": "缓存命中",
    "status.successRate": "成功率",
    "status.errorRate": "错误率",
    "status.availableKeys": "可用密钥",
    "status.empty": "暂无提供商数据",
    "status.loading": "正在拉取状态数据",
    "status.reloadFailed": "读取状态总览失败",
    "admin.loginTitle": "管理员登录",
    "admin.loginHint": "通过同源 Cookie 保持会话，浏览器重复打开时无需反复输入。",
    "admin.adminKey": "管理员密钥",
    "admin.adminKeyPlaceholder": "请输入管理员密钥",
    "admin.login": "登录",
    "admin.loginFailed": "管理员登录失败",
    "admin.globalTitle": "全局配置",
    "admin.globalSummary": "管理员密钥、客户端密钥和 Token 估算开关统一在这里维护。",
    "admin.clientKeys": "客户端访问密钥",
    "admin.clientKeysHint": "每行一个，或用半角逗号分隔",
    "admin.tokenEstimation": "上游缺少 Token 统计时启用估算",
    "admin.globalSaveSuccess": "全局配置已保存",
    "admin.globalSaveFailed": "保存全局配置失败",
    "admin.adminKeyConfigured": "管理员密钥已配置",
    "admin.adminKeyMissing": "管理员密钥未配置",
    "admin.providerWorkspace": "提供商工作区",
    "admin.providerWorkspaceEmpty": "先从左侧选择提供商，或先创建一个新提供商。",
    "admin.providerSearch": "搜索提供商",
    "admin.providerSearchPlaceholder": "按名称筛选",
    "admin.providerListTitle": "提供商列表",
    "admin.providerListEmpty": "当前还没有提供商",
    "admin.providerCreateTitle": "新增提供商",
    "admin.providerCreateSuccess": "提供商已保存",
    "admin.providerCreateFailed": "保存提供商失败",
    "admin.providerSaveSuccess": "提供商配置已更新",
    "admin.providerSaveFailed": "更新提供商配置失败",
    "admin.providerDeleteConfirm": "删除提供商会同时移除它的缓存和统计，确定继续吗？",
    "admin.providerDeleteSuccess": "提供商已删除",
    "admin.providerDeleteFailed": "删除提供商失败",
    "admin.providerDiscardDraft": "当前提供商有未保存修改，切换后会丢失，确定继续吗？",
    "admin.cacheClearConfirm": "这会删除当前提供商的本地缓存，确定继续吗？",
    "admin.cacheClearSuccess": "缓存已清空",
    "admin.cacheClearFailed": "清空缓存失败",
    "admin.importSuccess": "密钥导入完成",
    "admin.importFailed": "导入密钥失败",
    "admin.bulkActionSuccess": "批量操作已完成",
    "admin.bulkActionFailed": "批量操作失败",
    "admin.bulkDeleteConfirm": "删除已选密钥后无法恢复，确定继续吗？",
    "admin.singleDeleteConfirm": "删除这个密钥后无法恢复，确定继续吗？",
    "admin.keySearch": "筛选密钥",
    "admin.keySearchPlaceholder": "按显示值或引用筛选",
    "admin.bulkMode": "禁用方式",
    "admin.bulkModeTimed": "按时长禁用",
    "admin.bulkModeForever": "永久禁用",
    "admin.bulkDisableSeconds": "禁用秒数",
    "admin.bulkDisableRange": "允许范围 {min} - {max} 秒",
    "admin.importPlaceholder": "每行一个，或用半角逗号分隔",
    "admin.noKeys": "当前提供商还没有密钥",
    "admin.logsTitle": "最近日志",
    "admin.logsHint": "终端风格查看最近日志，便于排查鉴权、代理与缓存问题。",
    "admin.hidePanelLogs": "隐藏面板请求、健康检查和图标请求",
    "admin.logsEmpty": "暂无日志",
    "admin.overviewLoadFailed": "读取管理总览失败",
    "admin.unauthorized": "当前未登录，请先输入管理员密钥。",
    "provider.name": "名称",
    "provider.type": "接口类型",
    "provider.baseUrl": "上游地址",
    "provider.baseUrlPlaceholder": "留空时使用该类型默认地址",
    "provider.keyStrategy": "密钥策略",
    "provider.failThreshold": "连续失败阈值",
    "provider.minDisableSecs": "最小禁用秒数",
    "provider.maxDisableSecs": "最大禁用秒数",
    "provider.cacheEnabled": "启用缓存",
    "provider.cacheMaxEntries": "缓存最大条目数",
    "provider.stats": "当前状态",
    "provider.keys": "密钥列表",
    "provider.maskedValue": "显示值",
    "provider.reference": "引用",
    "provider.disabledUntil": "禁用到",
    "provider.fails": "连续失败",
    "provider.notDisabled": "未禁用",
    "provider.permanent": "永久禁用",
    "provider.invalidDisabledUntil": "禁用时间无效",
    "provider.selectedCount": "已选择 {count} 个密钥",
    "provider.availableKeys": "可用 {available}/{total}",
    "provider.clearSelectionOnRefresh": "已根据最新总览同步选择结果",
    "provider.type.openai_chat": "OpenAI Chat",
    "provider.type.openai_responses": "OpenAI Responses",
    "provider.type.claude": "Claude",
    "provider.type.gemini": "Gemini",
    "provider.strategy.round_robin": "轮询",
    "provider.strategy.fill": "填充",
    "message.loading": "加载中",
    "message.runtimeError": "页面运行异常",
    "message.noData": "暂无数据"
  };

  // src/i18n.js
  var allMessages = {
    en: enMessages,
    zh: zhMessages
  };
  function replaceTokens(template, params) {
    let output = String(template);
    const entries = Object.entries(params || {});
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      output = output.split("{" + entry[0] + "}").join(String(entry[1]));
    }
    return output;
  }
  function detectInitialLanguage() {
    const storedLanguage = window.localStorage.getItem("simple-api-pool.lang");
    if (storedLanguage === "en" || storedLanguage === "zh") {
      return storedLanguage;
    }
    const language = String(window.navigator.language || "").toLowerCase();
    if (language.indexOf("zh") === 0) {
      return "zh";
    }
    return "en";
  }
  function persistLanguage(language) {
    window.localStorage.setItem("simple-api-pool.lang", language);
  }
  function createTranslator(language) {
    const nextLanguage = language === "en" ? "en" : "zh";
    const activeMessages = allMessages[nextLanguage];
    return function translate(key, params) {
      const baseMessage = activeMessages[key] || zhMessages[key] || enMessages[key] || key;
      if (!params) {
        return baseMessage;
      }
      return replaceTokens(baseMessage, params);
    };
  }

  // src/stores/app_store.js
  var themeStorageKey = "simple-api-pool.theme";
  var BUILD_INFO = {
    version: "v0.1.34-dirty",
    revision: "fecec33",
    buildTime: "2026-05-09T14:32:23Z"
  };
  var appState = y3({
    language: detectInitialLanguage(),
    runtimeError: "",
    theme: readStoredTheme()
  });
  function buildVersionLabel() {
    return BUILD_INFO.version + " / " + BUILD_INFO.revision + " / " + BUILD_INFO.buildTime;
  }
  function readStoredTheme() {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  function persistTheme(theme) {
    window.localStorage.setItem(themeStorageKey, theme);
  }
  function setRuntimeError(message) {
    appState.value = {
      ...appState.value,
      runtimeError: String(message || "")
    };
  }
  function toggleLanguage() {
    appState.value = {
      ...appState.value,
      language: appState.value.language === "zh" ? "en" : "zh"
    };
  }
  function toggleTheme() {
    appState.value = {
      ...appState.value,
      theme: appState.value.theme === "light" ? "dark" : "light"
    };
  }

  // src/api.js
  var jsonContentType = "application/json";
  function isStructuredBody(body) {
    if (!body) {
      return false;
    }
    if (typeof body === "string") {
      return false;
    }
    if (body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams) {
      return false;
    }
    return true;
  }
  function parseResponseData(rawText) {
    const trimmedText = String(rawText || "").trim();
    if (!trimmedText) {
      return null;
    }
    try {
      return JSON.parse(trimmedText);
    } catch (_error) {
      return null;
    }
  }
  function extractResponseErrorMessage(data, rawText) {
    if (data && typeof data === "object") {
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error.trim();
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    }
    const trimmedText = String(rawText || "").trim();
    if (trimmedText) {
      return trimmedText;
    }
    return "";
  }
  function createRequestError(status, message) {
    const error = new Error(message || "Request failed");
    error.status = status;
    return error;
  }
  async function requestJSON(url, options) {
    const requestOptions = options || {};
    const headers = new Headers(requestOptions.headers || {});
    if (!headers.has("Accept")) {
      headers.set("Accept", jsonContentType);
    }
    const init = {
      credentials: "same-origin",
      headers,
      method: requestOptions.method || "GET"
    };
    if (requestOptions.signal) {
      init.signal = requestOptions.signal;
    }
    if (requestOptions.body !== void 0) {
      if (isStructuredBody(requestOptions.body)) {
        headers.set("Content-Type", jsonContentType);
        init.body = JSON.stringify(requestOptions.body);
      } else {
        init.body = requestOptions.body;
      }
    }
    const response = await fetch(url, init);
    const responseText = await response.text();
    const responseData = parseResponseData(responseText);
    const etag = response.headers.get("ETag") || "";
    if (response.status === 304) {
      return {
        data: null,
        etag,
        notModified: true,
        response
      };
    }
    if (!response.ok) {
      throw createRequestError(response.status, extractResponseErrorMessage(responseData, responseText));
    }
    return {
      data: responseData,
      etag,
      notModified: false,
      response
    };
  }
  function normalizeErrorMessage(error, fallbackText) {
    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    return fallbackText;
  }
  function splitImportedKeys(rawInput) {
    return String(rawInput || "").replace(/\r/g, "").split(/[,\n]/).map(function trimKey(value) {
      return value.trim();
    }).filter(function keepNonEmpty(value) {
      return value !== "";
    });
  }
  function parseImportedKeys(rawInput) {
    const rawKeys = splitImportedKeys(rawInput);
    const uniqueKeys = [];
    const seenKeys = /* @__PURE__ */ new Set();
    for (let index = 0; index < rawKeys.length; index += 1) {
      const keyValue = rawKeys[index];
      if (seenKeys.has(keyValue)) {
        continue;
      }
      seenKeys.add(keyValue);
      uniqueKeys.push(keyValue);
    }
    return uniqueKeys;
  }
  function toInteger(value, fallbackValue) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return fallbackValue;
    }
    return Math.trunc(parsedValue);
  }
  function clamp(value, minValue2, maxValue) {
    let nextValue = value;
    if (nextValue < minValue2) {
      nextValue = minValue2;
    }
    if (nextValue > maxValue) {
      nextValue = maxValue;
    }
    return nextValue;
  }

  // node_modules/valibot/dist/index.js
  var store;
  // @__NO_SIDE_EFFECTS__
  function getGlobalConfig(config2) {
    var _a, _b, _c;
    return {
      lang: (_a = config2 == null ? void 0 : config2.lang) != null ? _a : store == null ? void 0 : store.lang,
      message: config2 == null ? void 0 : config2.message,
      abortEarly: (_b = config2 == null ? void 0 : config2.abortEarly) != null ? _b : store == null ? void 0 : store.abortEarly,
      abortPipeEarly: (_c = config2 == null ? void 0 : config2.abortPipeEarly) != null ? _c : store == null ? void 0 : store.abortPipeEarly
    };
  }
  var store2;
  // @__NO_SIDE_EFFECTS__
  function getGlobalMessage(lang) {
    return store2 == null ? void 0 : store2.get(lang);
  }
  var store3;
  // @__NO_SIDE_EFFECTS__
  function getSchemaMessage(lang) {
    return store3 == null ? void 0 : store3.get(lang);
  }
  var store4;
  // @__NO_SIDE_EFFECTS__
  function getSpecificMessage(reference, lang) {
    var _a;
    return (_a = store4 == null ? void 0 : store4.get(reference)) == null ? void 0 : _a.get(lang);
  }
  // @__NO_SIDE_EFFECTS__
  function _stringify(input) {
    var _a, _b, _c;
    const type = typeof input;
    if (type === "string") {
      return `"${input}"`;
    }
    if (type === "number" || type === "bigint" || type === "boolean") {
      return `${input}`;
    }
    if (type === "object" || type === "function") {
      return (_c = input && ((_b = (_a = Object.getPrototypeOf(input)) == null ? void 0 : _a.constructor) == null ? void 0 : _b.name)) != null ? _c : "null";
    }
    return type;
  }
  function _addIssue(context, label, dataset, config2, other) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const input = other && "input" in other ? other.input : dataset.value;
    const expected = (_b = (_a = other == null ? void 0 : other.expected) != null ? _a : context.expects) != null ? _b : null;
    const received = (_c = other == null ? void 0 : other.received) != null ? _c : /* @__PURE__ */ _stringify(input);
    const issue = {
      kind: context.kind,
      type: context.type,
      input,
      expected,
      received,
      message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
      requirement: context.requirement,
      path: other == null ? void 0 : other.path,
      issues: other == null ? void 0 : other.issues,
      lang: config2.lang,
      abortEarly: config2.abortEarly,
      abortPipeEarly: config2.abortPipeEarly
    };
    const isSchema = context.kind === "schema";
    const message2 = (_h = (_g = (_f = (_e = (_d = other == null ? void 0 : other.message) != null ? _d : context.message) != null ? _e : /* @__PURE__ */ getSpecificMessage(context.reference, issue.lang)) != null ? _f : isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) != null ? _g : config2.message) != null ? _h : /* @__PURE__ */ getGlobalMessage(issue.lang);
    if (message2 !== void 0) {
      issue.message = typeof message2 === "function" ? (
        // @ts-expect-error
        message2(issue)
      ) : message2;
    }
    if (isSchema) {
      dataset.typed = false;
    }
    if (dataset.issues) {
      dataset.issues.push(issue);
    } else {
      dataset.issues = [issue];
    }
  }
  // @__NO_SIDE_EFFECTS__
  function _getStandardProps(context) {
    return {
      version: 1,
      vendor: "valibot",
      validate(value2) {
        return context["~run"]({ value: value2 }, /* @__PURE__ */ getGlobalConfig());
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function _joinExpects(values2, separator) {
    var _a;
    const list = [...new Set(values2)];
    if (list.length > 1) {
      return `(${list.join(` ${separator} `)})`;
    }
    return (_a = list[0]) != null ? _a : "never";
  }
  var ValiError = class extends Error {
    /**
     * Creates a Valibot error with useful information.
     *
     * @param issues The error issues.
     */
    constructor(issues) {
      super(issues[0].message);
      this.name = "ValiError";
      this.issues = issues;
    }
  };
  // @__NO_SIDE_EFFECTS__
  function integer(message2) {
    return {
      kind: "validation",
      type: "integer",
      reference: integer,
      async: false,
      expects: null,
      requirement: Number.isInteger,
      message: message2,
      "~run"(dataset, config2) {
        if (dataset.typed && !this.requirement(dataset.value)) {
          _addIssue(this, "integer", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function minLength(requirement, message2) {
    return {
      kind: "validation",
      type: "min_length",
      reference: minLength,
      async: false,
      expects: `>=${requirement}`,
      requirement,
      message: message2,
      "~run"(dataset, config2) {
        if (dataset.typed && dataset.value.length < this.requirement) {
          _addIssue(this, "length", dataset, config2, {
            received: `${dataset.value.length}`
          });
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function minValue(requirement, message2) {
    return {
      kind: "validation",
      type: "min_value",
      reference: minValue,
      async: false,
      expects: `>=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
      requirement,
      message: message2,
      "~run"(dataset, config2) {
        if (dataset.typed && !(dataset.value >= this.requirement)) {
          _addIssue(this, "value", dataset, config2, {
            received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value)
          });
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function trim() {
    return {
      kind: "transformation",
      type: "trim",
      reference: trim,
      async: false,
      "~run"(dataset) {
        dataset.value = dataset.value.trim();
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function getFallback(schema, dataset, config2) {
    return typeof schema.fallback === "function" ? (
      // @ts-expect-error
      schema.fallback(dataset, config2)
    ) : (
      // @ts-expect-error
      schema.fallback
    );
  }
  // @__NO_SIDE_EFFECTS__
  function getDefault(schema, dataset, config2) {
    return typeof schema.default === "function" ? (
      // @ts-expect-error
      schema.default(dataset, config2)
    ) : (
      // @ts-expect-error
      schema.default
    );
  }
  // @__NO_SIDE_EFFECTS__
  function array(item, message2) {
    return {
      kind: "schema",
      type: "array",
      reference: array,
      expects: "Array",
      async: false,
      item,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        var _a;
        const input = dataset.value;
        if (Array.isArray(input)) {
          dataset.typed = true;
          dataset.value = [];
          for (let key = 0; key < input.length; key++) {
            const value2 = input[key];
            const itemDataset = this.item["~run"]({ value: value2 }, config2);
            if (itemDataset.issues) {
              const pathItem = {
                type: "array",
                origin: "value",
                input,
                key,
                value: value2
              };
              for (const issue of itemDataset.issues) {
                if (issue.path) {
                  issue.path.unshift(pathItem);
                } else {
                  issue.path = [pathItem];
                }
                (_a = dataset.issues) == null ? void 0 : _a.push(issue);
              }
              if (!dataset.issues) {
                dataset.issues = itemDataset.issues;
              }
              if (config2.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!itemDataset.typed) {
              dataset.typed = false;
            }
            dataset.value.push(itemDataset.value);
          }
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function boolean(message2) {
    return {
      kind: "schema",
      type: "boolean",
      reference: boolean,
      expects: "boolean",
      async: false,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        if (typeof dataset.value === "boolean") {
          dataset.typed = true;
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function number(message2) {
    return {
      kind: "schema",
      type: "number",
      reference: number,
      expects: "number",
      async: false,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        if (typeof dataset.value === "number" && !isNaN(dataset.value)) {
          dataset.typed = true;
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function object(entries2, message2) {
    return {
      kind: "schema",
      type: "object",
      reference: object,
      expects: "Object",
      async: false,
      entries: entries2,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        var _a;
        const input = dataset.value;
        if (input && typeof input === "object") {
          dataset.typed = true;
          dataset.value = {};
          for (const key in this.entries) {
            const valueSchema = this.entries[key];
            if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && // @ts-expect-error
            valueSchema.default !== void 0) {
              const value2 = key in input ? (
                // @ts-expect-error
                input[key]
              ) : /* @__PURE__ */ getDefault(valueSchema);
              const valueDataset = valueSchema["~run"]({ value: value2 }, config2);
              if (valueDataset.issues) {
                const pathItem = {
                  type: "object",
                  origin: "value",
                  input,
                  key,
                  value: value2
                };
                for (const issue of valueDataset.issues) {
                  if (issue.path) {
                    issue.path.unshift(pathItem);
                  } else {
                    issue.path = [pathItem];
                  }
                  (_a = dataset.issues) == null ? void 0 : _a.push(issue);
                }
                if (!dataset.issues) {
                  dataset.issues = valueDataset.issues;
                }
                if (config2.abortEarly) {
                  dataset.typed = false;
                  break;
                }
              }
              if (!valueDataset.typed) {
                dataset.typed = false;
              }
              dataset.value[key] = valueDataset.value;
            } else if (valueSchema.fallback !== void 0) {
              dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
            } else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
              _addIssue(this, "key", dataset, config2, {
                input: void 0,
                expected: `"${key}"`,
                path: [
                  {
                    type: "object",
                    origin: "key",
                    input,
                    key,
                    // @ts-expect-error
                    value: input[key]
                  }
                ]
              });
              if (config2.abortEarly) {
                break;
              }
            }
          }
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function picklist(options, message2) {
    return {
      kind: "schema",
      type: "picklist",
      reference: picklist,
      expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
      async: false,
      options,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        if (this.options.includes(dataset.value)) {
          dataset.typed = true;
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  // @__NO_SIDE_EFFECTS__
  function string(message2) {
    return {
      kind: "schema",
      type: "string",
      reference: string,
      expects: "string",
      async: false,
      message: message2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        if (typeof dataset.value === "string") {
          dataset.typed = true;
        } else {
          _addIssue(this, "type", dataset, config2);
        }
        return dataset;
      }
    };
  }
  function parse2(schema, input, config2) {
    const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config2));
    if (dataset.issues) {
      throw new ValiError(dataset.issues);
    }
    return dataset.value;
  }
  // @__NO_SIDE_EFFECTS__
  function pipe(...pipe2) {
    return {
      ...pipe2[0],
      pipe: pipe2,
      get "~standard"() {
        return /* @__PURE__ */ _getStandardProps(this);
      },
      "~run"(dataset, config2) {
        for (const item of pipe2) {
          if (item.kind !== "metadata") {
            if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
              dataset.typed = false;
              break;
            }
            if (!dataset.issues || !config2.abortEarly && !config2.abortPipeEarly) {
              dataset = item["~run"](dataset, config2);
            }
          }
        }
        return dataset;
      }
    };
  }

  // src/forms/global_config_form.js
  var globalConfigSchema = object({
    admin_key: string(),
    client_keys: array(string()),
    include_client_keys: boolean(),
    token_estimation_enabled: boolean()
  });
  function createGlobalDraft(globalSnapshot) {
    const snapshot = globalSnapshot || {};
    return {
      admin_key: "",
      admin_key_configured: Boolean(snapshot.admin_key_configured),
      token_estimation_enabled: Boolean(snapshot.token_estimation_enabled),
      client_keys_text: ""
    };
  }
  function buildGlobalPayload(globalDraft, includeClientKeys) {
    const parsedPayload = parse2(globalConfigSchema, {
      admin_key: String(globalDraft.admin_key || "").trim(),
      client_keys: includeClientKeys ? parseImportedKeys(globalDraft.client_keys_text) : [],
      include_client_keys: Boolean(includeClientKeys),
      token_estimation_enabled: Boolean(globalDraft.token_estimation_enabled)
    });
    const payload = {
      token_estimation_enabled: parsedPayload.token_estimation_enabled
    };
    if (parsedPayload.include_client_keys) {
      payload.client_keys = parsedPayload.client_keys;
    }
    if (parsedPayload.admin_key) {
      payload.admin_key = parsedPayload.admin_key;
    }
    return payload;
  }

  // src/forms/provider_form.js
  var providerTypeValues = ["openai_chat", "openai_responses", "claude", "gemini"];
  var keyStrategyValues = ["round_robin", "fill"];
  var providerPayloadSchema = object({
    base_url: pipe(string(), trim(), minLength(1)),
    cache_enabled: boolean(),
    cache_max_entries: pipe(number(), integer(), minValue(1)),
    fail_threshold: pipe(number(), integer(), minValue(1)),
    key_strategy: picklist(keyStrategyValues),
    max_disable_secs: pipe(number(), integer(), minValue(1)),
    min_disable_secs: pipe(number(), integer(), minValue(1)),
    name: pipe(string(), trim(), minLength(1)),
    type: picklist(providerTypeValues)
  });
  function createDefaultProviderDraft() {
    return {
      name: "",
      type: "openai_chat",
      base_url: "",
      cache_enabled: false,
      cache_max_entries: 1e3,
      key_strategy: "round_robin",
      fail_threshold: 3,
      min_disable_secs: 30,
      max_disable_secs: 43200
    };
  }
  function createProviderDraftFromSnapshot(providerSnapshot) {
    if (!providerSnapshot) {
      return null;
    }
    return {
      name: providerSnapshot.name || "",
      type: providerSnapshot.type || "openai_chat",
      base_url: providerSnapshot.base_url || "",
      cache_enabled: Boolean(providerSnapshot.cache_enabled),
      cache_max_entries: toInteger(providerSnapshot.cache_max_entries, 1e3),
      key_strategy: providerSnapshot.key_strategy || "round_robin",
      fail_threshold: toInteger(providerSnapshot.fail_threshold, 3),
      min_disable_secs: toInteger(providerSnapshot.min_disable_secs, 30),
      max_disable_secs: toInteger(providerSnapshot.max_disable_secs, 43200)
    };
  }
  function buildProviderPayload(providerDraft) {
    const nextDraft = providerDraft || createDefaultProviderDraft();
    const minDisableSecs = Math.max(1, toInteger(nextDraft.min_disable_secs, 30));
    const maxDisableSecs = Math.max(minDisableSecs, toInteger(nextDraft.max_disable_secs, 43200));
    return parse2(providerPayloadSchema, {
      base_url: String(nextDraft.base_url || "").trim(),
      cache_enabled: Boolean(nextDraft.cache_enabled),
      cache_max_entries: Math.max(1, toInteger(nextDraft.cache_max_entries, 1e3)),
      fail_threshold: Math.max(1, toInteger(nextDraft.fail_threshold, 3)),
      key_strategy: nextDraft.key_strategy || "round_robin",
      max_disable_secs: maxDisableSecs,
      min_disable_secs: minDisableSecs,
      name: String(nextDraft.name || "").trim(),
      type: nextDraft.type || "openai_chat"
    });
  }

  // src/stores/admin_store.js
  function createEmptyAdminOverview() {
    return {
      health: { status: "unknown" },
      global_config: {
        admin_key_configured: false,
        token_estimation_enabled: false,
        client_key_count: 0
      },
      providers: [],
      provider_stats: {},
      recent_logs: []
    };
  }
  function createInitialAdminState() {
    return {
      actionMessage: { kind: "", text: "" },
      authenticated: false,
      bulkMode: "disable_until",
      bulkSeconds: 3600,
      checkedAuth: false,
      createProviderDraft: createDefaultProviderDraft(),
      createProviderMessage: { kind: "", text: "" },
      etag: "",
      globalClientKeysDirty: false,
      globalDirty: false,
      globalDraft: createGlobalDraft(null),
      globalMessage: { kind: "", text: "" },
      hidePanelLogs: true,
      importText: "",
      keySearch: "",
      logModalOpen: false,
      loginMessage: { kind: "", text: "" },
      loginPending: false,
      overview: createEmptyAdminOverview(),
      pending: false,
      providerMessage: { kind: "", text: "" },
      providerSearch: "",
      selectedKeyRefs: [],
      selectedProviderDraft: null,
      selectedProviderDirty: false,
      selectedProviderName: ""
    };
  }
  var adminState = y3(createInitialAdminState());
  function resetAdminState() {
    adminState.value = createInitialAdminState();
  }
  function setAdminState(nextStateOrUpdater) {
    adminState.value = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(adminState.value) : nextStateOrUpdater;
  }
  function getProviderByName(providers, providerName) {
    for (let index = 0; index < providers.length; index += 1) {
      if (providers[index].name === providerName) {
        return providers[index];
      }
    }
    return null;
  }
  function filterKeysBySearch(keys, searchText) {
    const normalizedSearch = String(searchText || "").trim().toLowerCase();
    if (!normalizedSearch) {
      return keys;
    }
    return keys.filter(function keepMatchingKey(keySnapshot) {
      const maskedValue = String(keySnapshot.value || "").toLowerCase();
      const reference = String(keySnapshot.ref || "").toLowerCase();
      return maskedValue.indexOf(normalizedSearch) >= 0 || reference.indexOf(normalizedSearch) >= 0;
    });
  }
  function filterSelectedRefs(selectedRefs, providerSnapshot) {
    if (!providerSnapshot || !providerSnapshot.keys) {
      return [];
    }
    const validRefs = /* @__PURE__ */ new Set();
    for (let index = 0; index < providerSnapshot.keys.length; index += 1) {
      validRefs.add(String(providerSnapshot.keys[index].ref || ""));
    }
    return selectedRefs.filter(function keepExistingRef(keyRef) {
      return validRefs.has(keyRef);
    });
  }
  function chooseSelectedProviderName(currentProviderName, providers, preferredProviderName) {
    const nextProviderName = preferredProviderName || currentProviderName;
    if (nextProviderName && getProviderByName(providers, nextProviderName)) {
      return nextProviderName;
    }
    if (providers.length === 0) {
      return "";
    }
    return providers[0].name;
  }
  function getDisableBounds(providerDraft) {
    const draft = providerDraft || createDefaultProviderDraft();
    const minDisableSecs = Math.max(1, toInteger(draft.min_disable_secs, 30));
    const maxDisableSecs = Math.max(minDisableSecs, toInteger(draft.max_disable_secs, 43200));
    return {
      max: maxDisableSecs,
      min: minDisableSecs
    };
  }
  function normalizeBulkSeconds(bulkSeconds, providerDraft) {
    const bounds = getDisableBounds(providerDraft);
    const fallbackValue = clamp(3600, bounds.min, bounds.max);
    return clamp(toInteger(bulkSeconds, fallbackValue), bounds.min, bounds.max);
  }
  function syncAdminStateFromOverview(currentState, overview, etag, options) {
    const syncOptions = options || {};
    const providers = overview.providers || [];
    const nextSelectedProviderName = chooseSelectedProviderName(
      currentState.selectedProviderName,
      providers,
      syncOptions.preferredProviderName
    );
    const nextSelectedProvider = getProviderByName(providers, nextSelectedProviderName);
    const preserveGlobalDraft = syncOptions.preserveGlobalDraft !== false;
    const preserveProviderDraft = syncOptions.preserveProviderDraft !== false;
    const keepGlobalDraft = preserveGlobalDraft && currentState.globalDirty;
    const keepProviderDraft = preserveProviderDraft && currentState.selectedProviderDirty && currentState.selectedProviderName === nextSelectedProviderName;
    return {
      ...currentState,
      actionMessage: syncOptions.resetActionMessage ? { kind: "", text: "" } : currentState.actionMessage,
      authenticated: true,
      bulkMode: currentState.bulkMode || "disable_until",
      bulkSeconds: normalizeBulkSeconds(
        currentState.bulkSeconds,
        keepProviderDraft ? currentState.selectedProviderDraft : createProviderDraftFromSnapshot(nextSelectedProvider)
      ),
      checkedAuth: true,
      etag,
      globalClientKeysDirty: keepGlobalDraft ? currentState.globalClientKeysDirty : false,
      globalDirty: keepGlobalDraft,
      globalDraft: keepGlobalDraft ? currentState.globalDraft : createGlobalDraft(overview.global_config),
      importText: syncOptions.resetProviderPanel ? "" : currentState.importText,
      keySearch: syncOptions.resetProviderPanel ? "" : currentState.keySearch,
      loginMessage: currentState.loginMessage,
      overview,
      pending: false,
      providerMessage: currentState.providerMessage,
      selectedKeyRefs: filterSelectedRefs(currentState.selectedKeyRefs, nextSelectedProvider),
      selectedProviderDirty: keepProviderDraft,
      selectedProviderDraft: keepProviderDraft ? currentState.selectedProviderDraft : createProviderDraftFromSnapshot(nextSelectedProvider),
      selectedProviderName: nextSelectedProviderName
    };
  }

  // src/services/status_service.js
  async function fetchStatusOverview(options) {
    const requestOptions = options || {};
    const headers = {};
    if (!requestOptions.forceRefresh && requestOptions.etag) {
      headers["If-None-Match"] = requestOptions.etag;
    }
    return requestJSON("/api/status/overview", { headers });
  }

  // src/stores/status_store.js
  function createEmptyStatusOverview() {
    return {
      health: { status: "unknown" },
      provider_stats: {}
    };
  }
  function normalizeHealthStatus(rawStatus) {
    const status = String(rawStatus || "").toLowerCase();
    if (status === "ok") {
      return "ok";
    }
    if (!status) {
      return "unknown";
    }
    return status;
  }
  function collectStatusSummary(overview) {
    const providerStats = overview && overview.provider_stats ? overview.provider_stats : {};
    const summary = {
      cacheHits: 0,
      cacheTokens: 0,
      errorCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerCount: 0,
      successCount: 0
    };
    const entries = Object.values(providerStats);
    summary.providerCount = entries.length;
    for (let index = 0; index < entries.length; index += 1) {
      const snapshot = entries[index] || {};
      summary.successCount += Number(snapshot.success_count || 0);
      summary.errorCount += Number(snapshot.error_count || 0);
      summary.inputTokens += Number(snapshot.input_tokens || 0);
      summary.outputTokens += Number(snapshot.output_tokens || 0);
      summary.cacheTokens += Number(snapshot.cache_tokens || 0);
      summary.cacheHits += Number(snapshot.cache_hits || 0);
    }
    return summary;
  }
  var statusState = y3({
    error: "",
    etag: "",
    loading: false,
    overview: createEmptyStatusOverview()
  });
  async function loadStatusOverview(forceRefresh, translate) {
    statusState.value = {
      ...statusState.value,
      error: "",
      loading: true
    };
    try {
      const result = await fetchStatusOverview({
        etag: statusState.value.etag,
        forceRefresh
      });
      if (result.notModified) {
        statusState.value = {
          ...statusState.value,
          loading: false
        };
        return;
      }
      statusState.value = {
        error: "",
        etag: result.etag,
        loading: false,
        overview: result.data || createEmptyStatusOverview()
      };
    } catch (error) {
      statusState.value = {
        ...statusState.value,
        error: normalizeErrorMessage(error, translate("status.reloadFailed")),
        loading: false
      };
    }
  }

  // src/shared/view_helpers.js
  var html = htm_module_default.bind(k);
  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }
  function formatPercent(successCount, errorCount) {
    const success = Number(successCount || 0);
    const error = Number(errorCount || 0);
    const total = success + error;
    if (total <= 0) {
      return "0%";
    }
    return (success / total * 100).toFixed(1) + "%";
  }
  function formatErrorRate(successCount, errorCount) {
    const success = Number(successCount || 0);
    const error = Number(errorCount || 0);
    const total = success + error;
    if (total <= 0) {
      return "0%";
    }
    return (error / total * 100).toFixed(1) + "%";
  }
  function isPermanentDisableValue(rawValue) {
    if (rawValue === null || rawValue === void 0 || rawValue === "") {
      return false;
    }
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return false;
    }
    return numericValue >= 3250368e4;
  }
  function formatDisabledUntil(rawValue, language, translate) {
    if (rawValue === null || rawValue === void 0 || rawValue === "" || Number(rawValue) <= 0) {
      return translate("provider.notDisabled");
    }
    if (isPermanentDisableValue(rawValue)) {
      return translate("provider.permanent");
    }
    const date = new Date(Number(rawValue) * 1e3);
    if (Number.isNaN(date.getTime())) {
      return translate("provider.invalidDisabledUntil");
    }
    return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false });
  }
  function getEntryAttr(entry, attrName) {
    if (!entry || !entry.attrs || typeof entry.attrs !== "object") {
      return "";
    }
    const value = entry.attrs[attrName];
    if (value === null || value === void 0) {
      return "";
    }
    return String(value);
  }
  function isPanelRequestLog(entry) {
    if (!entry || entry.msg !== "http_request") {
      return false;
    }
    const path = getEntryAttr(entry, "path");
    if (path === "/favicon.ico" || path === "/favicon.svg" || path === "/api/health") {
      return true;
    }
    return path.indexOf("/api/admin") === 0 || path.indexOf("/api/status") === 0;
  }
  function formatLogSummary(entry) {
    if (!entry || !entry.attrs || typeof entry.attrs !== "object") {
      return "";
    }
    const entries = Object.entries(entry.attrs);
    if (entries.length === 0) {
      return "";
    }
    return entries.map(function formatPair(pair) {
      return pair[0] + "=" + String(pair[1]);
    }).join(" · ");
  }
  function formatLogTime(rawTime, language) {
    const date = new Date(String(rawTime || ""));
    if (Number.isNaN(date.getTime())) {
      return String(rawTime || "");
    }
    return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false });
  }
  function InlineMessage(props) {
    if (!props.text) {
      return null;
    }
    return html`<p class=${"inline-message " + (props.kind || "")}>${props.text}</p>`;
  }
  function MetricCard(props) {
    return html`
    <article class="metric-card">
      <span class="metric-label">${props.label}</span>
      <strong class="metric-value">${props.value}</strong>
      <span class="metric-note">${props.note}</span>
    </article>
  `;
  }
  function StatusProviderCard(props) {
    const snapshot = props.snapshot || {};
    const successCount = Number(snapshot.success_count || 0);
    const errorCount = Number(snapshot.error_count || 0);
    return html`
    <article class="panel provider-status-card">
      <div class="provider-status-header">
        <div>
          <h3>${props.name}</h3>
          <p>${props.translate("provider.availableKeys", { available: Number(snapshot.available_keys || 0), total: Number(snapshot.total_keys || 0) })}</p>
        </div>
        <span class="status-pill ${normalizeHealthStatus(props.health)}">${normalizeHealthStatus(props.health)}</span>
      </div>
      <div class="status-grid">
        <div class="status-stat">
          <span>${props.translate("status.successRate")}</span>
          <strong>${formatPercent(successCount, errorCount)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.errorRate")}</span>
          <strong>${formatErrorRate(successCount, errorCount)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.inputTokens")}</span>
          <strong>${formatNumber(snapshot.input_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.outputTokens")}</span>
          <strong>${formatNumber(snapshot.output_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheTokens")}</span>
          <strong>${formatNumber(snapshot.cache_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheHits")}</span>
          <strong>${formatNumber(snapshot.cache_hits)}</strong>
        </div>
      </div>
    </article>
  `;
  }

  // src/routes/app_effects.js
  function useDocumentState(appStateSnapshot, route, translate) {
    y2(function syncDocument() {
      window.document.documentElement.lang = appStateSnapshot.language === "en" ? "en" : "zh-CN";
      window.document.documentElement.dataset.theme = appStateSnapshot.theme;
      window.document.title = route === "admin" ? "Simple API Pool - " + translate("app.adminTitle") : "Simple API Pool - " + translate("app.statusTitle");
      persistLanguage(appStateSnapshot.language);
      persistTheme(appStateSnapshot.theme);
    }, [appStateSnapshot.language, appStateSnapshot.theme, route, translate]);
  }
  function useRuntimeErrorBinding(translate) {
    y2(function bindRuntimeErrors() {
      function handleRuntimeError(event) {
        const failure = event && (event.error || event.reason);
        setRuntimeError(normalizeErrorMessage(failure, translate("message.runtimeError")));
      }
      window.addEventListener("error", handleRuntimeError);
      window.addEventListener("unhandledrejection", handleRuntimeError);
      return function cleanupRuntimeErrors() {
        window.removeEventListener("error", handleRuntimeError);
        window.removeEventListener("unhandledrejection", handleRuntimeError);
      };
    }, [translate]);
  }
  function useAdminLogsEscape(logModalOpen) {
    y2(function bindModalEscape() {
      if (!logModalOpen) {
        return void 0;
      }
      function handleKeyDown(event) {
        if (event.key !== "Escape") {
          return;
        }
        setAdminState(function closeModal(currentState) {
          return {
            ...currentState,
            logModalOpen: false
          };
        });
      }
      window.addEventListener("keydown", handleKeyDown);
      return function cleanupModalEscape() {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [logModalOpen]);
  }

  // src/services/admin_service.js
  async function fetchAdminOverview(options) {
    const requestOptions = options || {};
    const headers = {};
    if (!requestOptions.forceRefresh && requestOptions.etag) {
      headers["If-None-Match"] = requestOptions.etag;
    }
    return requestJSON("/api/admin/overview", { headers });
  }
  async function loginAdmin(adminKey) {
    return requestJSON("/api/admin/login", {
      body: { admin_key: adminKey },
      method: "POST"
    });
  }
  async function logoutAdmin() {
    return requestJSON("/api/admin/logout", { method: "POST" });
  }
  async function saveGlobalConfig(payload) {
    return requestJSON("/api/admin/config", {
      body: payload,
      method: "PUT"
    });
  }
  async function saveProvider(payload) {
    return requestJSON("/api/admin/providers", {
      body: payload,
      method: "POST"
    });
  }
  async function deleteProvider(providerName) {
    return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName), {
      method: "DELETE"
    });
  }
  async function clearProviderCache(providerName) {
    return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/cache", {
      method: "DELETE"
    });
  }
  async function importProviderKeys(providerName, keys) {
    return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/keys", {
      body: { keys },
      method: "POST"
    });
  }
  async function applyProviderBulkAction(providerName, payload) {
    return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/keys/bulk", {
      body: payload,
      method: "POST"
    });
  }
  async function deleteProviderKey(providerName, keyRef) {
    return requestJSON("/api/admin/providers/" + encodeURIComponent(providerName) + "/" + encodeURIComponent(keyRef), {
      method: "DELETE"
    });
  }

  // src/routes/admin_polling.js
  var statusPollIntervalMs = 15e3;
  var adminPollIntervalMs = 1e4;
  async function loadAdminOverview(translate, forceRefresh, syncOptions) {
    const nextSyncOptions = syncOptions || {};
    setAdminState(function markAdminLoading(currentState) {
      return {
        ...currentState,
        pending: true
      };
    });
    try {
      const result = await fetchAdminOverview({
        etag: adminState.value.etag,
        forceRefresh
      });
      if (result.notModified) {
        setAdminState(function markAdminReady(currentState) {
          return {
            ...currentState,
            authenticated: true,
            checkedAuth: true,
            pending: false
          };
        });
        return;
      }
      setAdminState(function mergeOverview(currentState) {
        return syncAdminStateFromOverview(currentState, result.data || createEmptyAdminOverview(), result.etag, nextSyncOptions);
      });
    } catch (error) {
      if (error && (error.status === 401 || error.status === 403)) {
        setAdminState(function resetAuthState(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "", text: "" },
            authenticated: false,
            checkedAuth: true,
            etag: "",
            globalMessage: { kind: "", text: "" },
            loginMessage: { kind: "error", text: translate("admin.unauthorized") },
            logModalOpen: false,
            overview: createEmptyAdminOverview(),
            pending: false,
            providerMessage: { kind: "", text: "" },
            selectedKeyRefs: [],
            selectedProviderDraft: null,
            selectedProviderDirty: false,
            selectedProviderName: ""
          };
        });
        return;
      }
      setAdminState(function setAdminError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.overviewLoadFailed")) },
          pending: false
        };
      });
    }
  }
  function createRefreshRoute(route, translate) {
    return function refreshRoute(forceRefresh) {
      if (route === "status") {
        void loadStatusOverview(Boolean(forceRefresh), translate);
        return;
      }
      void loadAdminOverview(translate, Boolean(forceRefresh));
    };
  }
  function useRoutePolling(route, adminStateSnapshot, translate) {
    y2(function schedulePolling() {
      let timerId = 0;
      const shouldProbeAdminAuth = route === "admin" && !adminStateSnapshot.checkedAuth;
      const shouldPollAdmin = route === "admin" && adminStateSnapshot.authenticated;
      if (route === "status") {
        void loadStatusOverview(false, translate);
      } else if (shouldProbeAdminAuth || shouldPollAdmin) {
        void loadAdminOverview(translate, false);
      }
      function refreshVisiblePage() {
        if (window.document.visibilityState === "hidden") {
          return;
        }
        if (route === "status") {
          void loadStatusOverview(true, translate);
          return;
        }
        if (adminState.value.authenticated) {
          void loadAdminOverview(translate, true);
        }
      }
      const intervalMs = route === "status" ? statusPollIntervalMs : shouldPollAdmin ? adminPollIntervalMs : 0;
      if (intervalMs > 0) {
        timerId = window.setInterval(function pollPage() {
          if (window.document.visibilityState === "hidden") {
            return;
          }
          if (route === "status") {
            void loadStatusOverview(false, translate);
            return;
          }
          if (adminState.value.authenticated) {
            void loadAdminOverview(translate, false);
          }
        }, intervalMs);
      }
      window.document.addEventListener("visibilitychange", refreshVisiblePage);
      return function cleanupPolling() {
        if (timerId) {
          window.clearInterval(timerId);
        }
        window.document.removeEventListener("visibilitychange", refreshVisiblePage);
      };
    }, [adminStateSnapshot.authenticated, adminStateSnapshot.checkedAuth, route, translate]);
  }

  // src/routes/route_state.js
  function resolveRoute(location2) {
    return location2 === "/admin" ? "admin" : "status";
  }
  function buildAdminRouteState(adminStateSnapshot) {
    const selectedProvider = getProviderByName(adminStateSnapshot.overview.providers || [], adminStateSnapshot.selectedProviderName);
    const selectedProviderStats = adminStateSnapshot.selectedProviderName ? adminStateSnapshot.overview.provider_stats[adminStateSnapshot.selectedProviderName] || {} : {};
    const visibleProviders = (adminStateSnapshot.overview.providers || []).filter(function keepVisibleProvider(providerSnapshot) {
      const searchText = String(adminStateSnapshot.providerSearch || "").trim().toLowerCase();
      if (!searchText) {
        return true;
      }
      return String(providerSnapshot.name || "").toLowerCase().indexOf(searchText) >= 0;
    });
    const visibleKeys = selectedProvider ? filterKeysBySearch(selectedProvider.keys || [], adminStateSnapshot.keySearch) : [];
    return {
      disableBounds: getDisableBounds(adminStateSnapshot.selectedProviderDraft),
      selectedProvider,
      selectedProviderStats,
      visibleKeys,
      visibleProviders
    };
  }
  function buildStatusRouteState(statusStateSnapshot) {
    return {
      statusSummary: collectStatusSummary(statusStateSnapshot.overview)
    };
  }

  // src/routes/admin_actions.js
  function createAdminActions(translate) {
    function handleGlobalDraftChange(fieldName, fieldValue) {
      setAdminState(function updateGlobalDraft(currentState) {
        return {
          ...currentState,
          globalClientKeysDirty: fieldName === "client_keys_text" ? true : currentState.globalClientKeysDirty,
          globalDirty: true,
          globalDraft: {
            ...currentState.globalDraft,
            [fieldName]: fieldValue
          }
        };
      });
    }
    function handleCreateProviderDraftChange(fieldName, fieldValue) {
      setAdminState(function updateCreateDraft(currentState) {
        return {
          ...currentState,
          createProviderDraft: {
            ...currentState.createProviderDraft,
            [fieldName]: fieldValue
          }
        };
      });
    }
    function handleSelectedProviderDraftChange(fieldName, fieldValue) {
      setAdminState(function updateSelectedDraft(currentState) {
        if (!currentState.selectedProviderDraft) {
          return currentState;
        }
        return {
          ...currentState,
          selectedProviderDirty: true,
          selectedProviderDraft: {
            ...currentState.selectedProviderDraft,
            [fieldName]: fieldValue
          }
        };
      });
    }
    function handleSelectProvider(providerName) {
      if (providerName === adminState.value.selectedProviderName) {
        return;
      }
      if (adminState.value.selectedProviderDirty && !window.confirm(translate("admin.providerDiscardDraft"))) {
        return;
      }
      const nextProvider = getProviderByName(adminState.value.overview.providers || [], providerName);
      setAdminState(function setSelectedProvider(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "", text: "" },
          bulkSeconds: normalizeBulkSeconds(currentState.bulkSeconds, nextProvider),
          importText: "",
          keySearch: "",
          providerMessage: { kind: "", text: "" },
          selectedKeyRefs: [],
          selectedProviderDraft: createProviderDraftFromSnapshot(nextProvider),
          selectedProviderDirty: false,
          selectedProviderName: providerName
        };
      });
    }
    async function handleLoginSubmit(event) {
      event.preventDefault();
      const adminKey = String(event.currentTarget.admin_key.value || "").trim();
      setAdminState(function markLoginPending(currentState) {
        return {
          ...currentState,
          loginMessage: { kind: "", text: "" },
          loginPending: true
        };
      });
      try {
        await loginAdmin(adminKey);
        setAdminState(function setLoginSuccess(currentState) {
          return {
            ...currentState,
            checkedAuth: false,
            loginMessage: { kind: "ok", text: "" },
            loginPending: false
          };
        });
        await loadAdminOverview(translate, true, {
          preserveGlobalDraft: false,
          preserveProviderDraft: false,
          resetProviderPanel: true
        });
      } catch (error) {
        setAdminState(function setLoginFailure(currentState) {
          return {
            ...currentState,
            loginMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.loginFailed")) },
            loginPending: false
          };
        });
      }
    }
    async function handleLogout() {
      try {
        await logoutAdmin();
      } catch (_error) {
      }
      resetAdminState();
    }
    async function handleGlobalSave(event) {
      event.preventDefault();
      try {
        await saveGlobalConfig(buildGlobalPayload(adminState.value.globalDraft, adminState.value.globalClientKeysDirty));
        setAdminState(function markGlobalSaved(currentState) {
          return {
            ...currentState,
            globalClientKeysDirty: false,
            globalDirty: false,
            globalMessage: { kind: "ok", text: translate("admin.globalSaveSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preserveGlobalDraft: false,
          preserveProviderDraft: true
        });
      } catch (error) {
        setAdminState(function setGlobalSaveError(currentState) {
          return {
            ...currentState,
            globalMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.globalSaveFailed")) }
          };
        });
      }
    }
    async function handleCreateProvider(event) {
      event.preventDefault();
      try {
        const response = await saveProvider(buildProviderPayload(adminState.value.createProviderDraft));
        const nextProviderName = response.data && response.data.name ? response.data.name : "";
        setAdminState(function markProviderCreated(currentState) {
          return {
            ...currentState,
            createProviderDraft: createDefaultProviderDraft(),
            createProviderMessage: { kind: "ok", text: translate("admin.providerCreateSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: nextProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: false,
          resetProviderPanel: true
        });
      } catch (error) {
        setAdminState(function setCreateProviderError(currentState) {
          return {
            ...currentState,
            createProviderMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerCreateFailed")) }
          };
        });
      }
    }
    async function handleSaveSelectedProvider(event) {
      event.preventDefault();
      if (!adminState.value.selectedProviderDraft) {
        return;
      }
      try {
        await saveProvider(buildProviderPayload(adminState.value.selectedProviderDraft));
        setAdminState(function markProviderSaved(currentState) {
          return {
            ...currentState,
            providerMessage: { kind: "ok", text: translate("admin.providerSaveSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: adminState.value.selectedProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: false
        });
      } catch (error) {
        setAdminState(function setSaveProviderError(currentState) {
          return {
            ...currentState,
            providerMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerSaveFailed")) }
          };
        });
      }
    }
    async function handleDeleteProvider() {
      if (!adminState.value.selectedProviderName) {
        return;
      }
      if (!window.confirm(translate("admin.providerDeleteConfirm"))) {
        return;
      }
      try {
        await deleteProvider(adminState.value.selectedProviderName);
        setAdminState(function markProviderDeleted(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "ok", text: translate("admin.providerDeleteSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: "",
          preserveGlobalDraft: true,
          preserveProviderDraft: false,
          resetProviderPanel: true
        });
      } catch (error) {
        setAdminState(function setDeleteProviderError(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerDeleteFailed")) }
          };
        });
      }
    }
    async function handleClearCache() {
      if (!adminState.value.selectedProviderName) {
        return;
      }
      if (!window.confirm(translate("admin.cacheClearConfirm"))) {
        return;
      }
      try {
        await clearProviderCache(adminState.value.selectedProviderName);
        setAdminState(function markCacheCleared(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "ok", text: translate("admin.cacheClearSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: adminState.value.selectedProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: true
        });
      } catch (error) {
        setAdminState(function setClearCacheError(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.cacheClearFailed")) }
          };
        });
      }
    }
    async function handleImportKeys(event) {
      event.preventDefault();
      if (!adminState.value.selectedProviderName) {
        return;
      }
      try {
        await importProviderKeys(adminState.value.selectedProviderName, parseImportedKeys(adminState.value.importText));
        setAdminState(function markImportSuccess(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "ok", text: translate("admin.importSuccess") },
            importText: ""
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: adminState.value.selectedProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: true
        });
      } catch (error) {
        setAdminState(function setImportError(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.importFailed")) }
          };
        });
      }
    }
    async function applyBulkAction(actionName) {
      if (!adminState.value.selectedProviderName || adminState.value.selectedKeyRefs.length === 0) {
        return;
      }
      if (actionName === "delete" && !window.confirm(translate("admin.bulkDeleteConfirm"))) {
        return;
      }
      const requestBody = {
        action: actionName,
        keys: adminState.value.selectedKeyRefs.slice()
      };
      if (actionName === "disable") {
        if (adminState.value.bulkMode === "disable_forever") {
          requestBody.action = "disable_forever";
        } else {
          requestBody.action = "disable_until";
          requestBody.disable_seconds = normalizeBulkSeconds(adminState.value.bulkSeconds, adminState.value.selectedProviderDraft);
        }
      }
      try {
        await applyProviderBulkAction(adminState.value.selectedProviderName, requestBody);
        setAdminState(function markBulkActionSuccess(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "ok", text: translate("admin.bulkActionSuccess") },
            selectedKeyRefs: []
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: adminState.value.selectedProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: true
        });
      } catch (error) {
        setAdminState(function setBulkActionError(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.bulkActionFailed")) }
          };
        });
      }
    }
    async function handleDeleteSingleKey(keyRef) {
      if (!adminState.value.selectedProviderName || !keyRef) {
        return;
      }
      if (!window.confirm(translate("admin.singleDeleteConfirm"))) {
        return;
      }
      try {
        await deleteProviderKey(adminState.value.selectedProviderName, keyRef);
        setAdminState(function markSingleDelete(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "ok", text: translate("admin.bulkActionSuccess") }
          };
        });
        await loadAdminOverview(translate, true, {
          preferredProviderName: adminState.value.selectedProviderName,
          preserveGlobalDraft: true,
          preserveProviderDraft: true
        });
      } catch (error) {
        setAdminState(function setSingleDeleteError(currentState) {
          return {
            ...currentState,
            actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.bulkActionFailed")) }
          };
        });
      }
    }
    return {
      applyBulkAction,
      handleClearCache,
      handleCreateProvider,
      handleCreateProviderDraftChange,
      handleDeleteProvider,
      handleDeleteSingleKey,
      handleGlobalDraftChange,
      handleGlobalSave,
      handleImportKeys,
      handleLoginSubmit,
      handleLogout,
      handleSaveSelectedProvider,
      handleSelectProvider,
      handleSelectedProviderDraftChange
    };
  }

  // src/views/admin/admin_shell.js
  function AdminShell(props) {
    return html`
    <main class="admin-page">
      ${props.children}
      ${props.logsModal || null}
    </main>
  `;
  }

  // src/views/admin/key_workspace.js
  function KeyWorkspace(props) {
    if (!props.selectedProvider || !props.adminState.selectedProviderDraft) {
      return null;
    }
    return html`
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>${props.translate("provider.keys")}</h2>
          <p>${props.translate("provider.selectedCount", { count: props.adminState.selectedKeyRefs.length })}</p>
        </div>
        <div class="toolbar-row">
          <button class="ghost-button" type="button" onClick=${props.onToggleVisibleSelection}>${props.translate("action.selectVisible")}</button>
          <button class="ghost-button" type="button" onClick=${props.onClearSelection}>${props.translate("action.clearSelected")}</button>
        </div>
      </div>

      <div class="key-toolbar">
        <label class="field">
          <span>${props.translate("admin.keySearch")}</span>
          <input
            data-role="key-search-input"
            type="search"
            value=${props.adminState.keySearch}
            placeholder=${props.translate("admin.keySearchPlaceholder")}
            onInput=${function handleKeySearchInput(event) {
      props.onKeySearchChange(event.currentTarget.value);
    }}
          />
        </label>
        <label class="field">
          <span>${props.translate("admin.bulkMode")}</span>
          <select
            data-role="bulk-disable-mode"
            class="bulk-disable-mode"
            value=${props.adminState.bulkMode}
            onChange=${function handleBulkModeChange(event) {
      props.onBulkModeChange(event.currentTarget.value);
    }}
          >
            <option value="disable_until">${props.translate("admin.bulkModeTimed")}</option>
            <option value="disable_forever">${props.translate("admin.bulkModeForever")}</option>
          </select>
        </label>
        ${props.adminState.bulkMode === "disable_until" ? html`
              <label class="field">
                <span>${props.translate("admin.bulkDisableSeconds")}</span>
                <input
                  class="bulk-disable-seconds"
                  name="bulk-disable-seconds"
                  type="number"
                  min=${props.disableBounds.min}
                  max=${props.disableBounds.max}
                  value=${props.normalizeBulkSeconds(props.adminState.bulkSeconds, props.adminState.selectedProviderDraft)}
                  onInput=${function handleBulkSecondsInput(event) {
      props.onBulkSecondsChange(event.currentTarget.value);
    }}
                />
              </label>
            ` : null}
      </div>
      <p class="hint">${props.translate("admin.bulkDisableRange", { min: props.disableBounds.min, max: props.disableBounds.max })}</p>
      <div class="toolbar-row wrap">
        <button class="ghost-button" type="button" onClick=${function enableSelected() {
      void props.onApplyBulkAction("enable");
    }}>
          ${props.translate("action.enableSelected")}
        </button>
        <button class="ghost-button" type="button" onClick=${function disableSelected() {
      void props.onApplyBulkAction("disable");
    }}>
          ${props.translate("action.disableSelected")}
        </button>
        <button class="danger-button" type="button" onClick=${function deleteSelected() {
      void props.onApplyBulkAction("delete");
    }}>
          ${props.translate("action.deleteSelected")}
        </button>
      </div>

      <form class="stack-form import-form" onSubmit=${props.onImportKeys}>
        <label class="field">
          <span>${props.translate("action.importKeys")}</span>
          <textarea
            placeholder=${props.translate("admin.importPlaceholder")}
            value=${props.adminState.importText}
            onInput=${function handleImportTextInput(event) {
      props.onImportTextChange(event.currentTarget.value);
    }}
          ></textarea>
        </label>
        <button class="primary-button" type="submit">${props.translate("action.importKeys")}</button>
      </form>

      ${props.visibleKeys.length === 0 ? html`<div class="empty-panel">${props.translate("admin.noKeys")}</div>` : html`
            <div class="key-table-wrap">
              <table class="key-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>${props.translate("provider.maskedValue")}</th>
                    <th>${props.translate("provider.reference")}</th>
                    <th>${props.translate("provider.disabledUntil")}</th>
                    <th>${props.translate("provider.fails")}</th>
                    <th>${props.translate("action.delete")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.visibleKeys.map(function renderKeyRow(keySnapshot) {
      const keyRef = String(keySnapshot.ref || "");
      const checked = props.adminState.selectedKeyRefs.indexOf(keyRef) >= 0;
      return html`
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked=${checked}
                            onChange=${function handleKeyCheckboxChange(event) {
        props.onToggleKeySelection(keyRef, event.currentTarget.checked);
      }}
                          />
                        </td>
                        <td>${keySnapshot.value}</td>
                        <td><code>${keyRef}</code></td>
                        <td>${formatDisabledUntil(keySnapshot.disabled_until, props.language, props.translate)}</td>
                        <td>${formatNumber(keySnapshot.consecutive_fails)}</td>
                        <td>
                          <button class="ghost-button" type="button" onClick=${function deleteSingleKey() {
        void props.onDeleteSingleKey(keyRef);
      }}>
                            ${props.translate("action.delete")}
                          </button>
                        </td>
                      </tr>
                    `;
    })}
                </tbody>
              </table>
            </div>
          `}
    </article>
  `;
  }

  // src/views/admin/logs_modal.js
  function LogsModal(props) {
    if (!props.adminState.logModalOpen) {
      return null;
    }
    const filteredLogs = (props.adminState.overview.recent_logs || []).filter(function keepLogEntry(entry) {
      if (!props.adminState.hidePanelLogs) {
        return true;
      }
      return !isPanelRequestLog(entry);
    });
    return html`
    <div class="log-modal">
      <div class="log-modal-scrim" onClick=${props.onCloseLogs}></div>
      <section class="log-modal-panel">
        <div class="panel-heading">
          <div>
            <h2>${props.translate("admin.logsTitle")}</h2>
            <p>${props.translate("admin.logsHint")}</p>
          </div>
          <button class="ghost-button" type="button" onClick=${props.onCloseLogs}>
            ${props.translate("action.close")}
          </button>
        </div>
        <label class="field checkbox-field">
          <input
            type="checkbox"
            checked=${props.adminState.hidePanelLogs}
            onChange=${function toggleHidePanelLogs(event) {
      props.onHidePanelLogsChange(event.currentTarget.checked);
    }}
          />
          <span>${props.translate("admin.hidePanelLogs")}</span>
        </label>
        <div class="recent-log-list">
          ${filteredLogs.length === 0 ? html`<div class="empty-panel">${props.translate("admin.logsEmpty")}</div>` : filteredLogs.map(function renderLogEntry(entry) {
      return html`
                  <article class=${"terminal-log-entry level-" + String(entry.level || "info").toLowerCase()}>
                    <header>
                      <strong>${String(entry.level || "").toUpperCase()}</strong>
                      <span>${formatLogTime(entry.time, props.language)}</span>
                    </header>
                    <div class="terminal-log-message">${entry.msg}</div>
                    ${formatLogSummary(entry) ? html`<div class="terminal-log-summary">${formatLogSummary(entry)}</div>` : null}
                  </article>
                `;
    })}
        </div>
      </section>
    </div>
  `;
  }

  // src/views/admin/provider_fields.js
  function ProviderFields(props) {
    const draft = props.draft;
    return html`
    <div class="form-grid">
      <label class="field">
        <span>${props.translate("provider.name")}</span>
        <input
          name="name"
          type="text"
          value=${draft.name}
          readOnly=${Boolean(props.readOnlyName)}
          onInput=${function handleNameInput(event) {
      props.onChange("name", event.currentTarget.value);
    }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.type")}</span>
        <select
          name="type"
          value=${draft.type}
          disabled=${Boolean(props.disableType)}
          onChange=${function handleTypeChange(event) {
      props.onChange("type", event.currentTarget.value);
    }}
        >
          ${providerTypeValues.map(function renderProviderType(typeValue) {
      return html`<option value=${typeValue}>${props.translate("provider.type." + typeValue)}</option>`;
    })}
        </select>
      </label>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>${props.translate("provider.baseUrl")}</span>
        <input
          name="base_url"
          type="text"
          value=${draft.base_url}
          placeholder=${props.translate("provider.baseUrlPlaceholder")}
          onInput=${function handleBaseURLInput(event) {
      props.onChange("base_url", event.currentTarget.value);
    }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.keyStrategy")}</span>
        <select
          name="key_strategy"
          value=${draft.key_strategy}
          onChange=${function handleStrategyChange(event) {
      props.onChange("key_strategy", event.currentTarget.value);
    }}
        >
          ${keyStrategyValues.map(function renderKeyStrategy(strategyValue) {
      return html`<option value=${strategyValue}>${props.translate("provider.strategy." + strategyValue)}</option>`;
    })}
        </select>
      </label>
    </div>
    <div class="form-grid three-columns">
      <label class="field">
        <span>${props.translate("provider.failThreshold")}</span>
        <input
          name="fail_threshold"
          type="number"
          min="1"
          value=${draft.fail_threshold}
          onInput=${function handleFailThresholdInput(event) {
      props.onChange("fail_threshold", event.currentTarget.value);
    }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.minDisableSecs")}</span>
        <input
          name="min_disable_secs"
          type="number"
          min="1"
          value=${draft.min_disable_secs}
          onInput=${function handleMinDisableInput(event) {
      props.onChange("min_disable_secs", event.currentTarget.value);
    }}
        />
      </label>
      <label class="field">
        <span>${props.translate("provider.maxDisableSecs")}</span>
        <input
          name="max_disable_secs"
          type="number"
          min="1"
          value=${draft.max_disable_secs}
          onInput=${function handleMaxDisableInput(event) {
      props.onChange("max_disable_secs", event.currentTarget.value);
    }}
        />
      </label>
    </div>
    <div class="form-grid">
      <label class="field checkbox-field">
        <input
          name="cache_enabled"
          type="checkbox"
          checked=${Boolean(draft.cache_enabled)}
          onChange=${function handleCacheEnabledChange(event) {
      props.onChange("cache_enabled", event.currentTarget.checked);
    }}
        />
        <span>${props.translate("provider.cacheEnabled")}</span>
      </label>
      <label class="field">
        <span>${props.translate("provider.cacheMaxEntries")}</span>
        <input
          name="cache_max_entries"
          type="number"
          min="1"
          value=${draft.cache_max_entries}
          onInput=${function handleCacheEntriesInput(event) {
      props.onChange("cache_max_entries", event.currentTarget.value);
    }}
        />
      </label>
    </div>
  `;
  }

  // src/views/admin/provider_editor.js
  function ProviderEditor(props) {
    if (!props.selectedProvider || !props.adminState.selectedProviderDraft) {
      return html`<article class="panel empty-panel">${props.translate("admin.providerWorkspaceEmpty")}</article>`;
    }
    return html`
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>${props.selectedProvider.name}</h2>
          <p>${props.translate("provider.stats")}</p>
        </div>
        <div class="toolbar-row">
          <button class="ghost-button" type="button" onClick=${props.onClearCache}>${props.translate("action.clearCache")}</button>
          <button class="danger-button" type="button" onClick=${props.onDeleteProvider}>${props.translate("action.delete")}</button>
        </div>
      </div>
      <div class="status-grid">
        <div class="status-stat">
          <span>${props.translate("status.successRate")}</span>
          <strong>${formatPercent(props.selectedProviderStats.success_count, props.selectedProviderStats.error_count)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.errorRate")}</span>
          <strong>${formatErrorRate(props.selectedProviderStats.success_count, props.selectedProviderStats.error_count)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.inputTokens")}</span>
          <strong>${formatNumber(props.selectedProviderStats.input_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.outputTokens")}</span>
          <strong>${formatNumber(props.selectedProviderStats.output_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheHits")}</span>
          <strong>${formatNumber(props.selectedProviderStats.cache_hits)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.availableKeys")}</span>
          <strong>${props.translate("provider.availableKeys", {
      available: Number(props.selectedProviderStats.available_keys || 0),
      total: Number(props.selectedProviderStats.total_keys || 0)
    })}</strong>
        </div>
      </div>
      <form class="stack-form" onSubmit=${props.onSaveSelectedProvider}>
        <${ProviderFields}
          draft=${props.adminState.selectedProviderDraft}
          disableType=${true}
          onChange=${props.onSelectedProviderDraftChange}
          readOnlyName=${true}
          translate=${props.translate}
        />
        <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
          ${props.translate("action.save")}
        </button>
        <${InlineMessage} kind=${props.adminState.providerMessage.kind} text=${props.adminState.providerMessage.text} />
      </form>
    </article>
  `;
  }

  // src/views/admin/provider_sidebar.js
  function ProviderSidebar(props) {
    return html`
    <aside class="provider-sidebar">
      <div class="panel-heading">
        <div>
          <h2>${props.translate("admin.providerListTitle")}</h2>
          <p>${props.translate("admin.providerWorkspace")}</p>
        </div>
        <button class="ghost-button" type="button" disabled=${!props.adminState.authenticated} onClick=${props.onOpenLogs}>
          ${props.translate("action.openLogs")}
        </button>
      </div>
      <label class="field">
        <span>${props.translate("admin.providerSearch")}</span>
        <input
          id="provider-selector-search"
          type="search"
          value=${props.adminState.providerSearch}
          placeholder=${props.translate("admin.providerSearchPlaceholder")}
          onInput=${function handleProviderSearchInput(event) {
      props.onProviderSearchChange(event.currentTarget.value);
    }}
        />
      </label>
      <div class="provider-selector-list">
        ${props.visibleProviders.length === 0 ? html`<div class="empty-panel">${props.translate("admin.providerListEmpty")}</div>` : props.visibleProviders.map(function renderProviderSelector(providerSnapshot) {
      const providerStats = props.adminState.overview.provider_stats[providerSnapshot.name] || {};
      return html`
                <button
                  type="button"
                  class=${providerSnapshot.name === props.adminState.selectedProviderName ? "provider-selector-item active" : "provider-selector-item"}
                  onClick=${function selectProvider() {
        props.onSelectProvider(providerSnapshot.name);
      }}
                >
                  <strong>${providerSnapshot.name}</strong>
                  <span>${props.translate("provider.type." + providerSnapshot.type)}</span>
                  <span>${props.translate("provider.availableKeys", {
        available: Number(providerStats.available_keys || 0),
        total: Number(providerStats.total_keys || 0)
      })}</span>
                </button>
              `;
    })}
      </div>

      <form class="stack-form create-provider-form" onSubmit=${props.onCreateProvider}>
        <div class="panel-heading compact">
          <div>
            <h3>${props.translate("admin.providerCreateTitle")}</h3>
          </div>
        </div>
        <${ProviderFields}
          draft=${props.adminState.createProviderDraft}
          disableType=${false}
          onChange=${props.onCreateProviderDraftChange}
          readOnlyName=${false}
          translate=${props.translate}
        />
        <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
          ${props.translate("action.createProvider")}
        </button>
        <${InlineMessage} kind=${props.adminState.createProviderMessage.kind} text=${props.adminState.createProviderMessage.text} />
      </form>
    </aside>
  `;
  }

  // src/views/admin_page.js
  function AdminPage(props) {
    return html`
    <${AdminShell}
      logsModal=${html`
        <${LogsModal}
          adminState=${props.adminState}
          language=${props.language}
          onCloseLogs=${props.onCloseLogs}
          onHidePanelLogsChange=${props.onHidePanelLogsChange}
          translate=${props.translate}
        />
      `}
    >
      <section class="admin-grid">
        <article class="panel login-panel">
          <div class="panel-heading">
            <div>
              <h2>${props.translate("admin.loginTitle")}</h2>
              <p>${props.translate("admin.loginHint")}</p>
            </div>
            ${props.adminState.authenticated ? html`<button class="ghost-button" type="button" onClick=${props.onLogout}>${props.translate("action.logout")}</button>` : null}
          </div>

          ${props.adminState.authenticated ? html`<${InlineMessage}
                kind="ok"
                text=${props.adminState.globalDraft.admin_key_configured ? props.translate("admin.adminKeyConfigured") : props.translate("admin.adminKeyMissing")}
              />` : html`
                <form class="stack-form" onSubmit=${props.onLoginSubmit}>
                  <label class="field">
                    <span>${props.translate("admin.adminKey")}</span>
                    <input name="admin_key" type="password" placeholder=${props.translate("admin.adminKeyPlaceholder")} autocomplete="current-password" />
                  </label>
                  <button class="primary-button" type="submit" disabled=${props.adminState.loginPending}>
                    ${props.adminState.loginPending ? props.translate("message.loading") : props.translate("admin.login")}
                  </button>
                  <${InlineMessage} kind=${props.adminState.loginMessage.kind} text=${props.adminState.loginMessage.text} />
                </form>
              `}
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>${props.translate("admin.globalTitle")}</h2>
              <p>${props.translate("admin.globalSummary")}</p>
            </div>
          </div>
          <form class="stack-form" onSubmit=${props.onGlobalSave}>
            <label class="field">
              <span>${props.translate("admin.adminKey")}</span>
              <input
                type="password"
                value=${props.adminState.globalDraft.admin_key}
                placeholder=${props.translate("admin.adminKeyPlaceholder")}
                autocomplete="new-password"
                onInput=${function handleAdminKeyInput(event) {
      props.onGlobalDraftChange("admin_key", event.currentTarget.value);
    }}
              />
            </label>
            <label class="field checkbox-field">
              <input
                type="checkbox"
                checked=${Boolean(props.adminState.globalDraft.token_estimation_enabled)}
                onChange=${function handleTokenEstimationChange(event) {
      props.onGlobalDraftChange("token_estimation_enabled", event.currentTarget.checked);
    }}
              />
              <span>${props.translate("admin.tokenEstimation")}</span>
            </label>
            <label class="field">
              <span>${props.translate("admin.clientKeys")}</span>
              <textarea
                value=${props.adminState.globalDraft.client_keys_text}
                placeholder=${props.translate("admin.clientKeysHint")}
                onInput=${function handleClientKeysInput(event) {
      props.onGlobalDraftChange("client_keys_text", event.currentTarget.value);
    }}
              ></textarea>
            </label>
            <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
              ${props.translate("action.save")}
            </button>
            <${InlineMessage} kind=${props.adminState.globalMessage.kind} text=${props.adminState.globalMessage.text} />
          </form>
        </article>
      </section>

      ${props.adminState.actionMessage.text ? html`<${InlineMessage} kind=${props.adminState.actionMessage.kind} text=${props.adminState.actionMessage.text} />` : null}

      <section class="panel provider-layout">
        <${ProviderSidebar}
          adminState=${props.adminState}
          onCreateProvider=${props.onCreateProvider}
          onCreateProviderDraftChange=${props.onCreateProviderDraftChange}
          onOpenLogs=${props.onOpenLogs}
          onProviderSearchChange=${props.onProviderSearchChange}
          onSelectProvider=${props.onSelectProvider}
          translate=${props.translate}
          visibleProviders=${props.visibleProviders}
        />

        <div class="provider-main">
          <${ProviderEditor}
            adminState=${props.adminState}
            onClearCache=${props.onClearCache}
            onDeleteProvider=${props.onDeleteProvider}
            onSaveSelectedProvider=${props.onSaveSelectedProvider}
            onSelectedProviderDraftChange=${props.onSelectedProviderDraftChange}
            selectedProvider=${props.selectedProvider}
            selectedProviderStats=${props.selectedProviderStats}
            translate=${props.translate}
          />
          <${KeyWorkspace}
            adminState=${props.adminState}
            disableBounds=${props.disableBounds}
            language=${props.language}
            normalizeBulkSeconds=${props.normalizeBulkSeconds}
            onApplyBulkAction=${props.onApplyBulkAction}
            onBulkModeChange=${props.onBulkModeChange}
            onBulkSecondsChange=${props.onBulkSecondsChange}
            onClearSelection=${props.onClearSelection}
            onDeleteSingleKey=${props.onDeleteSingleKey}
            onImportKeys=${props.onImportKeys}
            onImportTextChange=${props.onImportTextChange}
            onKeySearchChange=${props.onKeySearchChange}
            onToggleKeySelection=${props.onToggleKeySelection}
            onToggleVisibleSelection=${props.onToggleVisibleSelection}
            selectedProvider=${props.selectedProvider}
            translate=${props.translate}
            visibleKeys=${props.visibleKeys}
          />
        </div>
      </section>
    </${AdminShell}>
  `;
  }

  // src/routes/admin_route_controller.js
  function useAdminRouteController(route, language, translate, refreshRoute) {
    const admin = adminState.value;
    const routeState = buildAdminRouteState(admin);
    const actions = createAdminActions(translate);
    return {
      page: html`
      <${AdminPage}
        adminState=${admin}
        disableBounds=${routeState.disableBounds}
        language=${language}
        normalizeBulkSeconds=${normalizeBulkSeconds}
        onApplyBulkAction=${actions.applyBulkAction}
        onBulkModeChange=${function handleBulkModeChange(nextMode) {
        setAdminState(function updateBulkMode(currentState) {
          return {
            ...currentState,
            bulkMode: nextMode
          };
        });
      }}
        onBulkSecondsChange=${function handleBulkSecondsChange(nextValue) {
        setAdminState(function updateBulkSeconds(currentState) {
          return {
            ...currentState,
            bulkSeconds: nextValue
          };
        });
      }}
        onClearCache=${actions.handleClearCache}
        onClearSelection=${function clearSelection() {
        setAdminState(function resetSelection(currentState) {
          return {
            ...currentState,
            selectedKeyRefs: []
          };
        });
      }}
        onCloseLogs=${function closeLogs() {
        setAdminState(function setLogModalClosed(currentState) {
          return {
            ...currentState,
            logModalOpen: false
          };
        });
      }}
        onCreateProvider=${actions.handleCreateProvider}
        onCreateProviderDraftChange=${actions.handleCreateProviderDraftChange}
        onDeleteProvider=${actions.handleDeleteProvider}
        onDeleteSingleKey=${actions.handleDeleteSingleKey}
        onGlobalDraftChange=${actions.handleGlobalDraftChange}
        onGlobalSave=${actions.handleGlobalSave}
        onHidePanelLogsChange=${function handleHidePanelLogsChange(checked) {
        setAdminState(function updateHidePanelLogs(currentState) {
          return {
            ...currentState,
            hidePanelLogs: checked
          };
        });
      }}
        onImportKeys=${actions.handleImportKeys}
        onImportTextChange=${function handleImportTextChange(nextValue) {
        setAdminState(function updateImportText(currentState) {
          return {
            ...currentState,
            importText: nextValue
          };
        });
      }}
        onKeySearchChange=${function handleKeySearchChange(nextValue) {
        setAdminState(function updateKeySearch(currentState) {
          return {
            ...currentState,
            keySearch: nextValue
          };
        });
      }}
        onLoginSubmit=${actions.handleLoginSubmit}
        onLogout=${actions.handleLogout}
        onOpenLogs=${function openLogs() {
        setAdminState(function setLogModalOpen(currentState) {
          return {
            ...currentState,
            logModalOpen: true
          };
        });
      }}
        onProviderSearchChange=${function handleProviderSearchChange(nextValue) {
        setAdminState(function updateProviderSearch(currentState) {
          return {
            ...currentState,
            providerSearch: nextValue
          };
        });
      }}
        onSaveSelectedProvider=${actions.handleSaveSelectedProvider}
        onSelectProvider=${actions.handleSelectProvider}
        onSelectedProviderDraftChange=${actions.handleSelectedProviderDraftChange}
        onToggleKeySelection=${function handleToggleKeySelection(keyRef, checked) {
        setAdminState(function updateKeySelection(currentState) {
          const nextSelectedKeyRefs = new Set(currentState.selectedKeyRefs);
          if (checked) {
            nextSelectedKeyRefs.add(keyRef);
          } else {
            nextSelectedKeyRefs.delete(keyRef);
          }
          return {
            ...currentState,
            selectedKeyRefs: Array.from(nextSelectedKeyRefs)
          };
        });
      }}
        onToggleVisibleSelection=${function toggleVisibleSelection() {
        const visibleRefs = routeState.visibleKeys.map(function mapKeyToRef(keySnapshot) {
          return String(keySnapshot.ref || "");
        });
        setAdminState(function updateVisibleSelection(currentState) {
          return {
            ...currentState,
            selectedKeyRefs: visibleRefs
          };
        });
      }}
        selectedProvider=${routeState.selectedProvider}
        selectedProviderStats=${routeState.selectedProviderStats}
        translate=${translate}
        visibleKeys=${routeState.visibleKeys}
        visibleProviders=${routeState.visibleProviders}
      />
    `,
      refresh() {
        refreshRoute(true);
      }
    };
  }

  // src/views/status_page.js
  function StatusPage(props) {
    const providerStats = props.statusState.overview.provider_stats || {};
    return html`
    <main class="status-page">
      <section class="summary-grid">
        <${MetricCard}
          label=${props.translate("status.health")}
          value=${normalizeHealthStatus(props.statusState.overview.health && props.statusState.overview.health.status)}
          note=${props.statusState.loading ? props.translate("status.loading") : props.translate("status.reloadFailed")}
        />
        <${MetricCard}
          label=${props.translate("status.providers")}
          value=${props.formatNumber(props.statusSummary.providerCount)}
          note=${props.translate("status.availableKeys")}
        />
        <${MetricCard}
          label=${props.translate("status.success")}
          value=${props.formatNumber(props.statusSummary.successCount)}
          note=${props.translate("status.successRate") + " " + props.formatPercent(props.statusSummary.successCount, props.statusSummary.errorCount)}
        />
        <${MetricCard}
          label=${props.translate("status.error")}
          value=${props.formatNumber(props.statusSummary.errorCount)}
          note=${props.translate("status.errorRate") + " " + props.formatErrorRate(props.statusSummary.successCount, props.statusSummary.errorCount)}
        />
      </section>

      ${props.statusState.error ? html`<${InlineMessage} kind="error" text=${props.statusState.error} />` : null}

      <section class="provider-card-list">
        ${Object.entries(providerStats).length === 0 ? html`<article class="panel empty-panel">${props.translate("status.empty")}</article>` : Object.entries(providerStats).map(function renderStatusCard(entry) {
      return html`
                <${StatusProviderCard}
                  name=${entry[0]}
                  snapshot=${entry[1]}
                  health=${props.statusState.overview.health && props.statusState.overview.health.status}
                  translate=${props.translate}
                />
              `;
    })}
      </section>
    </main>
  `;
  }

  // src/routes/status_route_controller.js
  function useStatusRouteController(translate, refreshRoute) {
    const status = statusState.value;
    const routeState = buildStatusRouteState(status);
    return {
      page: html`
      <${StatusPage}
        formatErrorRate=${formatErrorRate}
        formatNumber=${formatNumber}
        formatPercent=${formatPercent}
        statusState=${status}
        statusSummary=${routeState.statusSummary}
        translate=${translate}
      />
    `,
      refresh() {
        refreshRoute(true);
      }
    };
  }

  // src/routes/app_router.js
  function AppRouter() {
    const [location2, navigate2] = useLocation();
    const route = resolveRoute(location2);
    const app = appState.value;
    const translate = createTranslator(app.language);
    const refreshRoute = createRefreshRoute(route, translate);
    useDocumentState(app, route, translate);
    useRuntimeErrorBinding(translate);
    useAdminLogsEscape(adminState.value.logModalOpen);
    useRoutePolling(route, adminState.value, translate);
    function goTo(nextRoute) {
      navigate2(nextRoute === "admin" ? "/admin" : "/status");
    }
    const controller = route === "status" ? useStatusRouteController(translate, refreshRoute) : useAdminRouteController(route, app.language, translate, refreshRoute);
    return html`
    <div class="app-shell">
      <header class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Simple API Pool</p>
          <h1>${route === "admin" ? translate("app.adminTitle") : translate("app.statusTitle")}</h1>
          <p>${route === "admin" ? translate("app.adminCopy") : translate("app.statusCopy")}</p>
        </div>
        <div class="hero-actions">
          <div class="nav-row">
            <button class=${route === "status" ? "nav-button active" : "nav-button"} type="button" onClick=${function showStatus() {
      goTo("status");
    }}>
              ${translate("nav.status")}
            </button>
            <button class=${route === "admin" ? "nav-button active" : "nav-button"} type="button" onClick=${function showAdmin() {
      goTo("admin");
    }}>
              ${translate("nav.admin")}
            </button>
          </div>
          <div class="toolbar-row">
            <button class="ghost-button" type="button" onClick=${function refreshCurrentRoute() {
      controller.refresh();
    }}>
              ${translate("action.refresh")}
            </button>
            <button class="ghost-button" type="button" onClick=${toggleLanguage}>
              ${app.language === "zh" ? "EN" : "中"}
            </button>
            <button class="ghost-button" type="button" onClick=${toggleTheme}>
              ${app.theme === "light" ? "Dark" : "Light"}
            </button>
          </div>
          <div class="build-badge">
            <span>${translate("meta.version")}</span>
            <strong>${buildVersionLabel()}</strong>
          </div>
        </div>
      </header>

      ${app.runtimeError ? html`
            <section class="panel banner-panel">
              <${InlineMessage} kind="error" text=${app.runtimeError} />
            </section>
          ` : null}

      ${controller.page}
    </div>
  `;
  }

  // src/app.js
  var html2 = htm_module_default.bind(k);
  j3(function watchThemeSignal() {
    return appState.value.theme;
  });
  var appRoot = document.getElementById("app-root");
  if (appRoot) {
    R(html2`<${Router}><${AppRouter} /></${Router}>`, appRoot);
  }
})();
