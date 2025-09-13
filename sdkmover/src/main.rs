use std::path::Path;

use sdkmover::copy_developer;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: {} <source> <destination>", args[0]);
        std::process::exit(1);
    }
    let source = &args[1];
    let destination = &args[2];

    if let Err(e) = copy_developer(
        Path::new(source),
        Path::new(destination),
        Path::new("Contents/Developer"),
        false,
    ) {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
