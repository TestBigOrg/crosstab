// =========== Iframe Tools ==============

var runInIframe = function (iframe, fn) {
    /*jshint evil:true*/
    var args = [].slice.call(arguments, 2);
    return iframe.contentWindow.window.eval("("
        + fn
        + ").apply(window, " + JSON.stringify(args) + ");");
};

var compliantOnload = function (onload) {
    var done;
    return function () {
        if (!done && (
                !this.readyState
                || this.readyState === 'loaded'
                || this.readyState === 'complete')) {
            done = true;
            this.onload = this.onreadystatechange = null;
            onload();
        }
    };
};

var runIframe = function (onload) {
    // create iframe
    var iframe = document.createElement('iframe');

    var allArgs = [iframe];
    var args = [].slice.call(arguments);
    allArgs.push.apply(allArgs, args);
    //iframe.style.display = 'none';
    iframe.style.border = 'none';
    iframe.id = (Math.random() * 0xFFFFFFFF) | 0;
    iframe.src = "/test/iframe.html";

    iframe.onloadqueue = [];
    iframe.run = function (fn) {
        var args = [].slice.call(arguments, 1);
        fn = fn.toString();

        runInIframe(iframe, function (fn, args) {
            /*jshint evil:true*/
            fn = Function('return ' + fn + ';')();
            fn.apply(null, args);
        }, fn, args);
    };
    iframe.onloadqueue.push(onload);

    crosstabOnload = function () {
        for (var i = 0; i < iframe.onloadqueue.length; i++) {
            var fn = iframe.onloadqueue[i];
            iframe.run(fn);
        }
        iframe.onloadqueue = {
            push: iframe.run
        };
    };

    iframe.onload = iframe.onreadystatechange = compliantOnload(function () {
        iframe.run(function () {
            // addText helper function
            window.addText = function (txt) {
                var div = document.createElement('div');
                var text = document.createTextNode(txt);
                div.appendChild(text);
                document.body.appendChild(div);
            };

            addText('iframe loaded');
        });
        var crosstabScript = document.createElement('script');
        crosstabScript.type = 'text/javascript';
        crosstabScript.src = '/src/crosstab.js';

        var head = document.getElementsByTagName('head')[0] || document.documentElement;
        crosstabScript.onload = crosstabScript.onreadystatechange = compliantOnload(function () {
            crosstabOnload();
            if (head && crosstabScript.parentNode) {
                crosstabScript.parentNode.removeChild(crosstabScript);
            }
        });

        iframe.contentWindow.document.getElementsByTagName('head')[0]
            .appendChild(crosstabScript);
    });

    document.body.appendChild(iframe);
    return iframe;
};

var removeIframe = function (iframe) {
    if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
    }
};

// =========== Tests ==============

describe('requirements', function() {

    it('should have addEventListener defined', function() {
        expect(typeof(addEventListener)).to.not.be('undefined');
    });

    it('should have localStorage defined', function() {
        expect(typeof(localStorage)).to.not.be('undefined');
    });

    it('should have JSON defined', function() {
        expect(typeof(JSON)).to.not.be('undefined');
    });
});

describe('crosstab', function () {

    it('should be a function', function () {
        expect(window.crosstab).to.be.a('function');
    });

    it('should setup without issue', function (done) {
        crosstab(function() {
            expect(crosstab.supported).to.be(true);
            done();
        });
    });

    it('should receive broadcast when sent', function () {
        var msg = "TestMessage";
        var received;
        crosstab.once('test', function(message) {
            received = message.data;
        });
        crosstab.broadcast('test', msg);
        expect(received).to.be(msg);
    });

    it('should invoke event listeners in the order they added', function () {
        var msg = "TestMessage";
        var order = [];

        // http://stackoverflow.com/questions/280713/elements-order-in-a-for-in-loop
        crosstab.on('test', function(message) {
            expect((message || {}).data).to.be(msg);
            order.push(2);
        }, 'second');
        crosstab.on('test', function(message) {
            order.push(3);
        }, '3');
        crosstab.on('test', function(message) {
            order.push(1);
        }, 'first');
        crosstab.on('test', function(message) {
            expect((message || {}).data).to.be(msg);
            order.push(101);
        });
        crosstab.on('test', function(message) {
            order.push(102);
        });

        crosstab.broadcast('test', msg);
        expect(order).to.eql([2, 3, 1, 101, 102]);
    });

    it('should not invoke event listener after unsubscribing', function() {
        var msg = "test";
        var received;
        var offSuccessful;
        var listeners = crosstab.util.events.listeners;

        // -------------------------------
        // unsubscribe with event + key
        // -------------------------------
        var evt1 = 'test-1';
        crosstab.on(evt1, function(message) {
            received = message.data + '-1';
        }, 'first');
        crosstab.broadcast(evt1, msg);
        expect(received).to.eql(msg + '-1');

        // unsubscribe with event + non-exist key
        received = undefined;
        offSuccessful = crosstab.off(evt1, 'non-exist');
        expect(offSuccessful).to.eql(false);
        crosstab.broadcast(evt1, msg);
        expect(received).to.eql(msg + '-1');

        // unsubscribe with event + key
        var listenersLen = listeners(evt1).length;
        received = undefined;
        offSuccessful = crosstab.off(evt1, 'first');
        expect(offSuccessful).to.eql(true);
        crosstab.broadcast(evt1, msg);
        expect(received).to.be(undefined);
        expect(listeners(evt1).length).to.be(listenersLen-1);

        // -------------------------------
        // unsubscribe with event
        // -------------------------------
        var evt2 = 'test-2';
        crosstab.on(evt2, function(message) {
            received = message.data + '-1';
        }, 'first');
        crosstab.broadcast(evt2, msg);
        expect(received).to.eql(msg + '-1');

        // unsubcribe with non-exist event
        received = undefined;
        offSuccessful = crosstab.off('non-exist');
        expect(offSuccessful).to.eql(false);
        crosstab.broadcast(evt2, msg);
        expect(received).to.eql(msg + '-1');

        // unscribe with event
        received = undefined;
        offSuccessful = crosstab.off(evt2);
        expect(offSuccessful).to.eql(true);
        crosstab.broadcast(evt2, msg);
        expect(received).to.be(undefined);
    });

    it('should only trigger callback once for crosstab.once', function () {
        var msg = "TestOnce";
        var received;
        crosstab.once('testOnce', function (message) {
            received = message.data;
        });
        crosstab.broadcast('testOnce', msg);
        expect(received).to.be(msg);
        received = undefined;
        crosstab.broadcast('testOnce', msg);
        expect(received).to.be(undefined);
    });

    it('should throw if not supported and no error listeners have been registered', function () {
        crosstab.supported = false;
        var sentMsg = null;
        var throwError = null;

        var throwHandler = crosstab.on('throw', function(msg){
            sentMsg = msg;
        });

        try{
            crosstab.broadcast('throw', 'msg');
        }
        catch(err){
            throwError = err;
        }

        expect(sentMsg).to.be(null);
        expect(typeof throwError).to.be('object');
        expect(throwError.message).to.be('crosstab not supported');

        crosstab.off('throw', throwHandler);

        crosstab.supported = true;
    });

    it('should emit error if not supported and error listeners have been registered', function () {
        crosstab.supported = false;
        var sentMsg = null;
        var thrownError = null;
        var handledError = null;

        var errorHandler = crosstab.on('error', function(err){
            handledError = err;
        });

        var throwHandler = crosstab.on('emit', function(msg){
            console.log('emit', msg);
            sentMsg = msg;
        });

        try{
            crosstab.broadcast('emit', 'msg');
        }
        catch(err){
            thrownError = err;
        }

        expect(sentMsg).to.be(null);
        expect(thrownError).to.be(null);
        expect(typeof handledError).to.be('object');
        expect(handledError.message).to.be('crosstab not supported');

        crosstab.off('error', errorHandler);
        crosstab.off('emit', throwHandler);

        crosstab.supported = true;
    });

    describe('with iframe', function () {
        this.timeout(1000);
        var iframe;

        beforeEach(function (done) {
            this.timeout(20000);
            window.done = done;
            iframe = runIframe(function () {
                crosstab(function () {
                    addText('crosstab setup complete');
                });
                window.parent.done();
            });
        });

        afterEach(function () {
            //removeIframe(iframe);
        });

        it('should have crosstab.supported be true', function (done) {
            window.callback = function () {
                expect(crosstab.supported).to.be(true);
                done();
            };

            iframe.run(function () {
                crosstab(function () {
                    window.parent.setTimeout(window.parent.callback);
                });
            });
        });

        it('should receive broadcasts from other tabs', function (done) {
            window.callback = function () {
                expect(crosstab.supported).to.be(true);
            };

            var msg = "OtherTabTestMessage";
            var received;

            crosstab.once('otherTabTest', function (message) {
                received = message.data;
                expect(received).to.be(msg);
                done();
            });

            iframe.run(function (msg) {
                crosstab(function () {
                    window.parent.setTimeout(window.parent.callback);
                    crosstab.broadcast('otherTabTest', msg);
                });
            }, msg);
        });

        it('should only receive one broadcast in an iframe per broadcast sent', function (done) {
            var timeoutId;
            var received = 0;

            window.callback = function () {
                expect(crosstab.supported).to.be(true);
            };

            var checkReceived = function () {
                expect(received).to.be(1);
                done();
            };

            crosstab.on('iframeBroadcastTest', function (message) {
                received++;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(checkReceived, 50);
            });

            iframe.run(function () {
                crosstab(function () {
                    window.parent.setTimeout(window.parent.callback);
                    crosstab.on('iframeBroadcastTestStart', function () {
                        addText('starting broadcast test in iframe');
                        crosstab.broadcast('iframeBroadcastTest');
                    });
                    addText('telling iframe to start test');
                    window.top.crosstab.broadcast('iframeBroadcastTestStart');
                });
            });
        });

        window.createEvent = function (type, bubbles, cancelable) {
            var e;
            // FIXME use `new Event()` once PhantomJS 2.0 is available on npm
            if (document.createEvent) {
                e = document.createEvent('Event');
                e.initEvent(type, bubbles, cancelable);
            } else {
                e = new Event(type, { bubbles: bubbles, cancelable: cancelable });
            }

            return e;
        };

        it('should stop on beforeunload event and recover when canceled', function (done) {
            window.done = done;

            iframe.run(function () {
                crosstab(function() {

                    window.parent.expect(crosstab.stopKeepalive).to.be(undefined);

                    var e = window.parent.createEvent('beforeunload', true, true);
                    window.dispatchEvent(e);

                    window.parent.expect(crosstab.stopKeepalive).to.be(true);

                    // should recover if the event was canceled
                    e = window.parent.createEvent('DOMContentLoaded', true, false);
                    window.dispatchEvent(e);

                    window.parent.expect(crosstab.stopKeepalive).to.be(false);

                    window.parent.done();
                });
            });
        });

        it ('should stop on unload event after DOMContentLoaded event', function (done) {
            window.done = done;
            iframe.run(function () {
                crosstab(function() {

                    window.parent.expect(crosstab.stopKeepalive).to.be(undefined);

                    // FIXME use `new Event()` once PhantomJS 2.0 is available on npm
                    var e = window.parent.createEvent('DOMContentLoaded', true, false);
                    window.dispatchEvent(e);

                    e = window.parent.createEvent('beforeunload', true, true);
                    window.dispatchEvent(e);

                    // restoreLoop should have set crosstab.stopKeepalive to false
                    window.parent.expect(crosstab.stopKeepalive).to.be(false);

                    // should respond only to unload event now
                    e = window.parent.createEvent('unload', true, false);
                    window.dispatchEvent(e);

                    window.parent.expect(crosstab.stopKeepalive).to.be(true);

                    window.parent.done();
                });
            });
        });
    });
});
