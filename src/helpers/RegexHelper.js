const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// removes module number
const removeModuleNumber  = (string) => {

    return string.replace(/\d+$/g, '')
};

// returns module number
const getModuleNumber  = (string) => {
    let number = string.match(/\d+$|\d+(?=\s)/);
    if(number===null)
        return 0;
    return number[0];
};

module.exports = {
    escapeRegExp,
    removeModuleNumber,
    getModuleNumber
};




