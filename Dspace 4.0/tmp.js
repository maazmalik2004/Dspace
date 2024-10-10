function formatPath(path) {
    // Remove leading and trailing slashes (both forward and backward)
    path = path.replace(/^\/+|\\+$/g, '');

    // Remove consecutive slashes (both forward and backward)
    path = path.replace(/\/+/g, '/').replace(/\\+/g, '\\');

    // Replace every remaining single forward or backward slash with "\\"
    path = path.replace(/\/|\\/g, '\\\\');

    // Remove any leading or trailing double backslashes
    path = path.replace(/^\\\\+|\\\\+$/g, '');

    return path;
}

// Example usage
const path1 = "\\\\example\path\\to\\\file\\\\aalu";

console.log(JSON.stringify(formatPath(path1)));