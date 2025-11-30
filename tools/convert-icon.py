from PIL import Image
import os

def convert_to_ico(source, target):
    if not os.path.exists(source):
        print(f"Source file {source} not found.")
        return

    img = Image.open(source)
    img.save(target, format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(f"Created {target} from {source}")

if __name__ == "__main__":
    convert_to_ico('icon-512.png', 'app.ico')
