const colors = ['blue', 'green', 'yellow', 'red'];

export function randomColor() {
        const randomIndex = Math.floor(Math.random() * colors.length);
        return colors [randomIndex];  
  };



