import math

def generate_bright_vision_svg():
    # Defining the SVG content exactly as specified in the provided source code
    svg_content = """<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#00f2ff;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#ff00ff;stop-opacity:1" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    </defs>
    
    <rect width="512" height="512" fill="#0a0a12" rx="0" />

    <g transform="translate(256, 256)" filter="url(#glow)">
        <path d="M 0,-220 L 190,-110 L 190,110 L 0,220 L -190,110 L -190,-110 Z" 
              fill="none" stroke="url(#grad1)" stroke-width="2" opacity="0.4" />
              
        <g id="spiral">
    """
    
    # Generate 40 triangles exactly as prescribed
    for i in range(40):
        angle = i * 6.5
        scale = 1.0 - (i * 0.022)
        if scale < 0: break
        
        # Calculate triangle vertices
        r = 200 * scale
        v1 = (0, -r)
        v2 = (r * math.cos(math.radians(210)), r * -math.sin(math.radians(210)))
        v3 = (r * math.cos(math.radians(-30)), r * -math.sin(math.radians(-30)))
        
        opacity = 1.0 - (i * 0.02)
        
        svg_content += f"""
            <path d="M {v1[0]},{v1[1]} L {v2[0]},{v2[1]} L {v3[0]},{v3[1]} Z" 
                  fill="none" stroke="url(#grad1)" stroke-width="1.5" 
                  transform="rotate({angle})" opacity="{opacity}" />"""
    
    svg_content += """
        </g>
    </g>
</svg>
"""
    return svg_content

# Execute and save
final_svg_output = generate_bright_vision_svg()
with open("bright_vision_final_logo.svg", "w") as f:
    f.write(final_svg_output)
