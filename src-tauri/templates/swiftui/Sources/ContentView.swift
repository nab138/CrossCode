import SwiftUI

struct ContentView: View {
    @State private var items: [Date] = []

    var body: some View {
        NavigationView {
            VStack {
                List {
                    ForEach(items, id: \.self) { item in
                        Text(item.description)
                    }
                    .onDelete(perform: delete)
                }.toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        EditButton()
                    }
                }
                .listStyle(InsetGroupedListStyle())
            }
            .navigationTitle("{{projectName}}")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        withAnimation(.easeInOut) {
                            items.insert(Date(), at: 0)
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
    }

    func delete(at offsets: IndexSet) {
        items.remove(atOffsets: offsets)
    }
}
