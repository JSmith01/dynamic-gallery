export const throttle = (func, limit) => {
    let lastFunc;
    let lastRan = 0;
    function throttled(...args) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        }
        else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function () {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }
    throttled.cancel = () => {
        clearTimeout(lastFunc);
    };
    return throttled;
};
