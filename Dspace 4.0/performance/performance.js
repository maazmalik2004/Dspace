class Performance {
    constructor() {
        this.startTime = null;
        this.endTime = null;
    }

    start() {
        this.startTime = Date.now();
    }

    end() {
        if (this.startTime === null) {
            throw new Error('Performance has not been started. Please call start() first');
        }
        this.endTime = Date.now();
    }

    elapsed() {
        if (this.startTime === null) {
            throw new Error('Performance has not been started. Please call start() first');
        }
        if (this.endTime === null) {
            throw new Error('Performance has not been ended. Please call end() first');
        }
        return this.endTime - this.startTime;
    }
}

export default Performance;
